#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, getConfig } from '../src/config.js';
import { log } from '../src/util/log.js';
import { audioDuration } from '../src/util/audio.js';
import { formatDuration } from '../src/util/time.js';
import { createTts } from '../src/tts/index.js';
import { whiskLogin } from '../src/images/whisk.js';
import { learnTemplate } from '../src/capcut/draft.js';
import { validateDraft } from '../src/capcut/validate.js';
import { toTimelineReport } from '../src/timeline.js';
import {
  initProject,
  loadProject,
  saveProject,
  runTts,
  runPrompts,
  runImages,
  runCapcut,
  currentTimeline,
} from '../src/pipeline.js';

const HELP = `
autostory — bo tool auto lam video ke truyen
  kich ban -> giong doc -> anh minh hoa -> draft CapCut khop timeline

Cach dung: autostory <lenh> [tuy chon]

Lenh chinh
  run       --script <file> [--name <ten>]     Chay ca 4 buoc: tts -> prompts -> images -> capcut
  init      --script <file> [--name <ten>]     Doc kich ban, tao project
  tts       [--name] [--provider] [--voice]    Doc kich ban thanh giong noi
  prompts   [--name]                           Sinh prompt anh cho tung cau thoai
  images    [--name] [--provider]              Sinh + tai anh minh hoa
  capcut    [--name] [--draft-dir <thu muc>]   Xuat draft CapCut + phu de .srt

Tro giup
  voices    [--provider elevenlabs|minimax]    Liet ke giong co san
  clone     --provider <p> --name <ten> --samples a.mp3,b.mp3
                                               Clone giong tu file mau
  whisk-login                                  Dang nhap Google mot lan cho provider whisk
  timeline  [--name]                           In bang timeline hien tai
  check     [--name]                           Kiem tra draft da xuat truoc khi mo CapCut
  capcut-template --from <draft_content.json> [--name]
                                               Hoc dinh dang draft tu mot project CapCut that

Tuy chon dung chung
  --name <ten>        Ten project (mac dinh: suy tu @title cua kich ban)
  --provider <p>      Ghi de provider cho lenh do
  --voice <id>        Voice id cho TTS
  --draft-dir <d>     Thu muc draft cua CapCut (hoac dat CAPCUT_DRAFT_DIR trong .env)
  --draft-name <n>    Ten draft hien trong CapCut
  --music <file>      Nhac nen (tu lap lai cho du do dai)
  --music-volume <v>  Am luong nhac nen, 0..1 (mac dinh 0.18)
  --subtitles         Chen luon track phu de vao draft (file .srt thi luon co)
  --template <file>   draft_content.json that de hoc dinh dang
  --max-chars <n>     Do dai toi da moi cau khi tach kich ban (mac dinh 220)
  --force             Lam lai buoc do du da co ket qua
  --env <file>        Duong dan file .env (mac dinh ./.env)

Vi du
  autostory run --script examples/kich-ban-mau.txt --name dem-trang
  autostory images --provider whisk --name dem-trang
  autostory capcut --name dem-trang --subtitles --music nhac.mp3
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function configFrom(args) {
  loadEnvFile(typeof args.env === 'string' ? args.env : '.env');
  return getConfig({
    ...(args['draft-dir'] ? { capcutDraftDir: String(args['draft-dir']) } : {}),
    ...(args['no-kenburns'] ? { kenBurns: { enabled: false } } : {}),
  });
}

function requireName(args, config) {
  const name = args.name && typeof args.name === 'string' ? args.name : null;
  if (name) return name;
  // Neu chi co mot project thi khong bat nguoi dung phai go --name.
  const dir = path.resolve(config.workDir);
  const found = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'project.json')))
    : [];
  if (found.length === 1) return found[0];
  if (!found.length) throw new Error('Chua co project nao. Chay: autostory init --script <file>');
  throw new Error(`Co ${found.length} project, can chi ro --name. Dang co: ${found.join(', ')}`);
}

function musicFrom(args) {
  if (!args.music || typeof args.music !== 'string') return null;
  const file = path.resolve(args.music);
  if (!fs.existsSync(file)) throw new Error(`Khong tim thay file nhac: ${file}`);
  const duration = audioDuration(fs.readFileSync(file), path.extname(file));
  if (!duration) log.warn('Khong doc duoc do dai file nhac — se chi chen mot lan.');
  return { file, duration, volume: args['music-volume'] ? Number(args['music-volume']) : 0.18 };
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  if (!command || command === 'help' || args.help) {
    console.log(HELP);
    return;
  }

  const config = configFrom(args);
  const force = Boolean(args.force);
  const provider = typeof args.provider === 'string' ? args.provider : undefined;

  switch (command) {
    case 'init': {
      if (!args.script) throw new Error('Thieu --script <file kich ban>');
      initProject({
        scriptFile: String(args.script),
        name: typeof args.name === 'string' ? args.name : undefined,
        config,
        maxChars: args['max-chars'] ? Number(args['max-chars']) : undefined,
      });
      break;
    }

    case 'tts': {
      const project = loadProject(config, requireName(args, config));
      await runTts({ project, config, provider, voiceId: typeof args.voice === 'string' ? args.voice : undefined, force });
      break;
    }

    case 'prompts': {
      const project = loadProject(config, requireName(args, config));
      await runPrompts({ project, config, force });
      break;
    }

    case 'images': {
      const project = loadProject(config, requireName(args, config));
      await runImages({ project, config, provider, force });
      break;
    }

    case 'capcut': {
      const project = loadProject(config, requireName(args, config));
      runCapcut({
        project,
        config,
        draftDir: typeof args['draft-dir'] === 'string' ? args['draft-dir'] : undefined,
        draftName: typeof args['draft-name'] === 'string' ? args['draft-name'] : undefined,
        templateFile: typeof args.template === 'string' ? args.template : undefined,
        music: musicFrom(args),
        subtitles: Boolean(args.subtitles),
      });
      break;
    }

    case 'run': {
      let project;
      if (args.script) {
        project = initProject({
          scriptFile: String(args.script),
          name: typeof args.name === 'string' ? args.name : undefined,
          config,
          maxChars: args['max-chars'] ? Number(args['max-chars']) : undefined,
        });
      } else {
        project = loadProject(config, requireName(args, config));
      }
      await runTts({ project, config, provider: typeof args['tts-provider'] === 'string' ? args['tts-provider'] : undefined, voiceId: typeof args.voice === 'string' ? args.voice : undefined, force });
      await runPrompts({ project, config, force });
      await runImages({ project, config, provider: typeof args['image-provider'] === 'string' ? args['image-provider'] : provider, force });
      runCapcut({
        project,
        config,
        draftDir: typeof args['draft-dir'] === 'string' ? args['draft-dir'] : undefined,
        draftName: typeof args['draft-name'] === 'string' ? args['draft-name'] : undefined,
        templateFile: typeof args.template === 'string' ? args.template : undefined,
        music: musicFrom(args),
        subtitles: Boolean(args.subtitles),
      });
      break;
    }

    case 'voices': {
      const tts = createTts(config, provider);
      const voices = await tts.listVoices();
      log.ok(`${voices.length} giong tu ${tts.name}:`);
      for (const v of voices) {
        console.log(`  ${String(v.id).padEnd(26)} ${String(v.category || '').padEnd(10)} ${v.name}`);
      }
      break;
    }

    case 'clone': {
      const tts = createTts(config, provider);
      if (!args.name || !args.samples) throw new Error('Can --name <ten giong> va --samples <file1,file2>');
      const files = String(args.samples).split(',').map((s) => path.resolve(s.trim()));
      for (const file of files) {
        if (!fs.existsSync(file)) throw new Error(`Khong tim thay file mau: ${file}`);
      }
      log.warn('Chi clone giong khi ban co quyen dung giong do (giong cua chinh ban, hoac nguoi noi da dong y).');
      const voice = await tts.cloneVoice({ name: String(args.name), files });
      log.ok(`Da tao giong "${voice.name}" — voice id: ${voice.id}`);
      break;
    }

    case 'whisk-login': {
      await whiskLogin(config.whisk);
      break;
    }

    case 'timeline': {
      const project = loadProject(config, requireName(args, config));
      const timeline = currentTimeline(project, config);
      console.log(toTimelineReport(timeline, config.fps));
      log.ok(`Tong: ${formatDuration(timeline.duration)} · ${timeline.stats.imageCount} anh · ${timeline.stats.lineCount} cau`);
      break;
    }

    case 'check': {
      const project = loadProject(config, requireName(args, config));
      if (!project.draftFolder) throw new Error('Chua xuat draft. Chay: autostory capcut');
      const file = path.join(project.draftFolder, 'draft_content.json');
      const result = validateDraft(JSON.parse(fs.readFileSync(file, 'utf8')));
      for (const w of result.warnings) log.warn(w);
      for (const p of result.problems) log.error(p);
      if (result.ok) log.ok(`Draft hop le: ${file}`);
      else process.exitCode = 1;
      break;
    }

    case 'capcut-template': {
      if (!args.from) throw new Error('Thieu --from <draft_content.json cua mot project CapCut that>');
      const template = learnTemplate(String(args.from));
      const project = loadProject(config, requireName(args, config));
      project.capcutTemplate = template;
      saveProject(project);
      log.ok(`Da hoc dinh dang draft: app_version=${template.app_version}, version=${template.version}`);
      break;
    }

    default:
      log.error(`Lenh khong biet: ${command}`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  log.error(err.message);
  if (process.env.AUTOSTORY_DEBUG) console.error(err);
  process.exitCode = 1;
});
