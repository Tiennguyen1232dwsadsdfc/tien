import fs from 'node:fs';
import path from 'node:path';
import { parseScript } from './script/parse.js';
import { createTts } from './tts/index.js';
import { createImageProvider } from './images/index.js';
import { buildStoryBible, generateImagePrompts, fallbackPrompts } from './prompt/imagePrompts.js';
import { buildTimeline, toSrt, toTimelineReport, toOverlayPlan } from './timeline.js';
import { buildDraft, writeDraftFolder, learnTemplate } from './capcut/draft.js';
import { audioDuration } from './util/audio.js';
import { ensureDir, readJson, writeJson, writeFileSafe, slugify } from './util/fs.js';
import { mapLimit } from './util/http.js';
import { log, progress } from './util/log.js';
import { formatDuration } from './util/time.js';

/**
 * Moi buoc deu luu ket qua vao project.json va bo qua viec da lam xong.
 * TTS va sinh anh deu ton tien, nen chay lai lenh phai la viec an toan —
 * chi lam phan con thieu.
 */

const STATE_FILE = 'project.json';

export function projectPaths(config, name) {
  const root = path.resolve(config.workDir, name);
  return {
    root,
    state: path.join(root, STATE_FILE),
    script: path.join(root, 'script.txt'),
    audio: path.join(root, 'audio'),
    images: path.join(root, 'images'),
    srt: path.join(root, 'subtitles.srt'),
    overlay: path.join(root, 'overlay.md'),
    timelineTxt: path.join(root, 'timeline.txt'),
    draftFallback: path.join(root, 'capcut-draft'),
  };
}

export function loadProject(config, name) {
  const paths = projectPaths(config, name);
  const state = readJson(paths.state, null);
  if (!state) throw new Error(`Chua co project "${name}". Chay: autostory init --script <file> --name ${name}`);
  return { ...state, paths };
}

export function saveProject(project) {
  const { paths, ...state } = project;
  writeJson(paths.state, state);
  return project;
}

export function initProject({ scriptFile, name, config, maxChars }) {
  const raw = fs.readFileSync(scriptFile, 'utf8');
  const script = parseScript(raw, { maxChars });
  const projectName = name || slugify(script.meta.title || path.basename(scriptFile, path.extname(scriptFile)));
  const paths = projectPaths(config, projectName);
  ensureDir(paths.root);
  fs.copyFileSync(scriptFile, paths.script);

  const project = {
    name: projectName,
    createdAt: new Date().toISOString(),
    sourceScript: path.resolve(scriptFile),
    script,
    audio: [],
    prompts: [],
    bible: null,
    images: [],
    paths,
  };
  saveProject(project);
  log.ok(
    `Project "${projectName}": ${script.stats.lineCount} cau, ${script.stats.sceneCount} canh, ${script.stats.charCount} ky tu.`,
  );
  return project;
}

/** Buoc 1: doc thanh giong noi. */
export async function runTts({ project, config, provider, voiceId, force = false }) {
  const tts = createTts(config, provider);
  const voice = voiceId || project.script.meta.voice || undefined;
  ensureDir(project.paths.audio);

  const existing = new Map((project.audio || []).map((a) => [a.id, a]));
  const lines = project.script.lines;

  // File audio nguoi dung tu dat san vao thu muc audio/ duoc nhan lam ket qua va
  // khong doc lai. Dung khi mot kich ban can nhieu giong: thu am rieng vai cau
  // bang giong khac roi dat vao day, cac cau con lai de tool doc.
  const adopted = [];
  if (!force) {
    for (const line of lines) {
      const prev = existing.get(line.id);
      if (prev?.file && fs.existsSync(prev.file) && prev.text === line.text) continue;
      const found = fs
        .readdirSync(project.paths.audio)
        .find((name) => name.replace(/\.[^.]+$/, '') === line.id);
      if (!found) continue;
      const file = path.join(project.paths.audio, found);
      const duration = audioDuration(fs.readFileSync(file), path.extname(file));
      if (!duration) {
        log.warn(`${line.id}: khong doc duoc do dai file ${found} — bo qua, se doc lai cau nay.`);
        continue;
      }
      existing.set(line.id, {
        id: line.id,
        text: line.text,
        file,
        duration,
        provider: 'manual',
        voiceId: null,
      });
      adopted.push(line.id);
    }
  }
  if (adopted.length) {
    log.ok(`Dung ${adopted.length} file giong doc ban tu dat san: ${adopted.join(', ')}`);
  }
  const todo = lines.filter((line) => {
    if (force) return true;
    const prev = existing.get(line.id);
    return !(prev && prev.text === line.text && prev.file && fs.existsSync(prev.file));
  });

  log.step(`TTS (${tts.name}): can doc ${todo.length}/${lines.length} cau.`);
  if (todo.length) {
    const bar = progress('  doc', todo.length);
    await mapLimit(todo, Math.max(1, config.ttsConcurrency), async (line) => {
      const outFile = path.join(project.paths.audio, `${line.id}.${tts.ext}`);
      const prev = lines[line.index - 1]?.text || '';
      const next = lines[line.index + 1]?.text || '';
      const result = await tts.synthesize({
        text: line.text,
        voiceId: voice,
        outFile,
        previousText: prev,
        nextText: next,
      });
      existing.set(line.id, {
        id: line.id,
        text: line.text,
        file: result.file,
        duration: result.duration,
        provider: tts.name,
        voiceId: voice || null,
      });
      bar.tick();
    });
    bar.done();
  }

  // Do lai do dai tu chinh file tren dia cho moi cau, khong tin so da luu.
  // Can thiet vi nguoi dung co the ghi de mot file bang ban thu am khac dai ngan
  // khac — giu so cu se lam ca timeline lech ma khong co dau hieu gi.
  for (const line of lines) {
    const entry = existing.get(line.id);
    if (!entry?.file || !fs.existsSync(entry.file)) continue;
    const measured = audioDuration(fs.readFileSync(entry.file), path.extname(entry.file));
    if (!measured) continue;
    if (entry.duration > 0 && Math.abs(measured - entry.duration) > 0.05) {
      log.info(`${line.id}: file doi do dai ${entry.duration.toFixed(2)}s -> ${measured.toFixed(2)}s, da cap nhat timeline.`);
    }
    entry.duration = measured;
  }

  project.audio = lines.map((line) => existing.get(line.id)).filter(Boolean);
  const total = project.audio.reduce((s, a) => s + (a.duration || 0), 0);
  saveProject(project);
  log.ok(`Xong giong doc: ${project.audio.length} file, tong ${formatDuration(total)}.`);
  return project;
}

/** Buoc 2: sinh prompt anh tu tung cau. */
export async function runPrompts({ project, config, force = false }) {
  const have = new Map((project.prompts || []).map((p) => [p.id, p]));
  const missing = project.script.lines.filter((l) => force || !have.get(l.id)?.prompt);
  if (!missing.length) {
    log.ok(`Prompt anh: da co du ${have.size} prompt (dung --force de lam lai).`);
    return project;
  }

  if (!config.anthropic.apiKey) {
    const style = project.script.meta.style || config.imageStyle;
    project.prompts = fallbackPrompts(project.script.lines, { style });
    saveProject(project);
    log.warn(`Khong co ANTHROPIC_API_KEY — da dung prompt du phong cho ${project.prompts.length} cau.`);
    return project;
  }

  if (!project.bible || force) {
    log.step('Doc toan bo kich ban de chot nhan vat / boi canh / bang mau...');
    project.bible = await buildStoryBible({ script: project.script, config });
    saveProject(project);
    log.ok(`Story bible: ${project.bible.characters.length} nhan vat, ${project.bible.settings.length} boi canh.`);
  }

  const scriptForPrompts = force
    ? project.script
    : { ...project.script, lines: missing };
  const generated = await generateImagePrompts({ script: scriptForPrompts, config, bible: project.bible });
  for (const item of generated) have.set(item.id, item);
  project.prompts = project.script.lines.map((l) => have.get(l.id)).filter(Boolean);
  saveProject(project);
  log.ok(`Xong prompt anh: ${project.prompts.length} prompt.`);
  return project;
}

/** Buoc 3: sinh + tai anh. */
export async function runImages({ project, config, provider, force = false }) {
  if (!project.prompts?.length) throw new Error('Chua co prompt anh. Chay buoc prompts truoc.');
  const timeline = currentTimeline(project, config);
  ensureDir(project.paths.images);

  const imageProvider = createImageProvider(config, provider);
  const have = new Map((project.images || []).map((img) => [img.imageId, img]));

  // Anh nguoi dung tu dat san vao thu muc images (vi du canh san pham phai ghep
  // anh hop that) duoc nhan lam ket qua va khong sinh lai. Day la cach giu cac
  // canh lam tay khi chay lai pipeline.
  const adopted = [];
  if (!force) {
    for (const seg of timeline.imageSegments) {
      if (have.get(seg.imageId)?.file && fs.existsSync(have.get(seg.imageId).file)) continue;
      const found = fs
        .readdirSync(project.paths.images)
        .find((name) => name.replace(/\.[^.]+$/, '') === seg.imageId);
      if (!found) continue;
      const file = path.join(project.paths.images, found);
      have.set(seg.imageId, {
        imageId: seg.imageId,
        lineId: seg.lineId,
        file,
        width: config.width,
        height: config.height,
        prompt: seg.prompt,
        provider: 'manual',
      });
      adopted.push(seg.imageId);
    }
  }
  if (adopted.length) {
    log.ok(`Dung ${adopted.length} anh ban tu dat san: ${adopted.join(', ')}`);
  }

  const todo = timeline.imageSegments.filter((seg) => {
    if (force) return true;
    const prev = have.get(seg.imageId);
    return !(prev && prev.file && fs.existsSync(prev.file) && prev.prompt === seg.prompt);
  });

  log.step(`Sinh anh (${imageProvider.name}): can ${todo.length}/${timeline.imageSegments.length} anh.`);
  if (todo.length) {
    const bar = progress('  ve', todo.length);
    // Whisk dieu khien 1 cua so trinh duyet -> phai chay tuan tu.
    const limit = imageProvider.name === 'whisk' ? 1 : Math.max(1, config.imageConcurrency);
    await mapLimit(todo, limit, async (seg, i) => {
      const outFile = path.join(project.paths.images, `${seg.imageId}.${imageProvider.ext}`);
      const result = await imageProvider.generate({
        prompt: seg.prompt,
        negative: seg.negative,
        outFile,
        index: seg.lineIndex * 10 + i,
      });
      have.set(seg.imageId, {
        imageId: seg.imageId,
        lineId: seg.lineId,
        file: result.file,
        width: result.width || config.width,
        height: result.height || config.height,
        prompt: seg.prompt,
        provider: imageProvider.name,
      });
      bar.tick();
    });
    bar.done();
  }
  if (imageProvider.close) await imageProvider.close();

  project.images = timeline.imageSegments.map((seg) => have.get(seg.imageId)).filter(Boolean);
  saveProject(project);
  log.ok(`Xong anh: ${project.images.length} file trong ${project.paths.images}`);
  return project;
}

export function currentTimeline(project, config) {
  const promptsById = new Map((project.prompts || []).map((p) => [p.id, p]));
  return buildTimeline({ lines: project.script.lines, audio: project.audio || [], config, promptsById });
}

/** Buoc 4: xuat draft CapCut. */
export function runCapcut({ project, config, draftDir, draftName, templateFile, music, subtitles }) {
  if (!project.audio?.length) throw new Error('Chua co giong doc. Chay buoc tts truoc.');
  const timeline = currentTimeline(project, config);

  writeFileSafe(project.paths.srt, toSrt(timeline.audioSegments));
  writeFileSafe(project.paths.timelineTxt, toTimelineReport(timeline, config.fps));
  const overlayCount = timeline.audioSegments.filter((s) => s.overlay).length;
  writeFileSafe(project.paths.overlay, toOverlayPlan(timeline.audioSegments, config.fps));

  const template = templateFile ? learnTemplate(templateFile) : project.capcutTemplate || null;
  const name = draftName || project.name;
  const { draft, missing } = buildDraft({
    timeline,
    images: project.images || [],
    config,
    name,
    template,
    music,
    subtitles,
  });

  const target = draftDir || config.capcutDraftDir || project.paths.draftFallback;
  const folder = writeDraftFolder({ draft, draftDir: target, name, timeline });

  project.timeline = timeline.stats;
  project.draftFolder = folder;
  saveProject(project);

  if (missing.length) {
    log.warn(`Thieu ${missing.length} tai nguyen, da bo qua trong draft: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '...' : ''}`);
  }
  log.ok(`Draft CapCut: ${folder}`);
  log.dim(`  do dai ${formatDuration(timeline.duration)} · ${timeline.stats.imageCount} anh · ${timeline.stats.lineCount} cau thoai`);
  log.dim(`  phu de: ${project.paths.srt}`);
  if (overlayCount) {
    log.warn(`Con ${overlayCount} dong chu phai dat tay trong CapCut — xem ${project.paths.overlay}`);
  }
  if (!config.capcutDraftDir && !draftDir) {
    log.warn('Chua dat CAPCUT_DRAFT_DIR — draft nam trong project. Copy thu muc tren vao thu muc draft cua CapCut roi mo lai CapCut.');
  }
  return project;
}
