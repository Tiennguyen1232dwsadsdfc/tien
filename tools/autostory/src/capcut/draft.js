import fs from 'node:fs';
import path from 'node:path';
import { secToUs, US } from '../util/time.js';
import { capcutPath, ensureDir, writeJson } from '../util/fs.js';
import { buildMove, planMoves, validateMove } from './kenburns.js';
import * as K from './skeleton.js';

/**
 * Dung file draft CapCut tu timeline.
 *
 * Bo cuc track:
 *   track 0 (video) : anh minh hoa, noi tiep nhau khong ho
 *   track 1 (audio) : giong doc tung cau, dat dung vi tri trong timeline
 *   track 2 (audio) : nhac nen (neu co), lap lai cho du do dai
 *   track 3 (text)  : phu de (neu bat --subtitles)
 */

const PROPERTY = {
  scaleX: 'KFTypeScaleX',
  scaleY: 'KFTypeScaleY',
  positionX: 'KFTypePositionX',
  positionY: 'KFTypePositionY',
};

function keyframesForMove(move, durationUs, kenBurns) {
  const points = buildMove(move, kenBurns);
  const check = validateMove(points);
  if (!check.ok) throw new Error(`Hieu ung ${move} khong hop le: ${check.reason}`);
  if (points.length < 2) return [];

  const at = (p) => Math.round(p.at * durationUs);
  const series = [
    [PROPERTY.scaleX, points.map((p) => ({ timeOffsetUs: at(p), value: p.scale }))],
    [PROPERTY.scaleY, points.map((p) => ({ timeOffsetUs: at(p), value: p.scale }))],
  ];
  if (points.some((p) => p.x !== 0)) {
    series.push([PROPERTY.positionX, points.map((p) => ({ timeOffsetUs: at(p), value: p.x }))]);
  }
  if (points.some((p) => p.y !== 0)) {
    series.push([PROPERTY.positionY, points.map((p) => ({ timeOffsetUs: at(p), value: p.y }))]);
  }
  return series.map(([property, pts]) => K.keyframeList(property, pts));
}

/**
 * Hoc cac truong phu thuoc phien ban tu mot draft CapCut that tren may nguoi dung.
 * Nho vay draft sinh ra khop voi ban CapCut dang cai, khong phai doan.
 */
export function learnTemplate(draftContentFile) {
  const real = JSON.parse(fs.readFileSync(draftContentFile, 'utf8'));
  return {
    app_version: real.app_version,
    version: real.version,
    new_version: real.new_version,
    platform: real.platform,
    last_modified_platform: real.last_modified_platform,
  };
}

export function buildDraft({
  timeline,
  images,
  config,
  name,
  template = null,
  music = null,
  subtitles = false,
}) {
  const draft = K.emptyDraft({
    width: config.width,
    height: config.height,
    fps: config.fps,
    appVersion: config.capcutAppVersion,
  });
  if (template) Object.assign(draft, template);
  draft.name = name;

  const M = draft.materials;
  const videoTrack = K.newTrack('video');
  const voiceTrack = K.newTrack('audio');
  draft.tracks.push(videoTrack, voiceTrack);

  const imageByKey = new Map(images.map((img) => [img.imageId, img]));
  const moves = config.kenBurns.enabled
    ? planMoves(timeline.imageSegments.length, config.kenBurns)
    : timeline.imageSegments.map(() => 'none');

  const missing = [];

  // ---- Track anh ----
  timeline.imageSegments.forEach((seg, i) => {
    const img = imageByKey.get(seg.imageId) || imageByKey.get(seg.lineId);
    if (!img?.file || !fs.existsSync(img.file)) {
      missing.push(seg.imageId);
      return;
    }
    const material = K.photoMaterial({
      file: capcutPath(img.file),
      width: img.width || config.width,
      height: img.height || config.height,
      name: path.basename(img.file),
    });
    const canvas = K.canvasMaterial();
    const speed = K.speedMaterial();
    const mapping = K.soundChannelMapping();
    const vocal = K.vocalSeparation();
    M.videos.push(material);
    M.canvases.push(canvas);
    M.speeds.push(speed);
    M.sound_channel_mappings.push(mapping);
    M.vocal_separations.push(vocal);

    // Quy doi moc dau/cuoi rieng roi lay hieu, thay vi lam tron do dai:
    // lam tron hai dau doc lap se de lai khe ho 1 micro-giay giua cac clip.
    const startUs = secToUs(seg.start);
    const durationUs = secToUs(seg.start + seg.duration) - startUs;
    videoTrack.segments.push(
      K.videoSegment({
        materialId: material.id,
        startUs,
        durationUs,
        extraRefs: [speed.id, canvas.id, mapping.id, vocal.id],
        keyframes: keyframesForMove(moves[i], durationUs, config.kenBurns),
        renderIndex: i,
      }),
    );
  });

  // ---- Track giong doc ----
  timeline.audioSegments.forEach((seg, i) => {
    if (!seg.file || !fs.existsSync(seg.file)) {
      missing.push(`audio:${seg.lineId}`);
      return;
    }
    const durationUs = secToUs(seg.duration);
    const material = K.audioMaterial({
      file: capcutPath(seg.file),
      duration: durationUs,
      name: path.basename(seg.file),
    });
    const speed = K.speedMaterial();
    const mapping = K.soundChannelMapping(true);
    const beats = K.beatsMaterial();
    const vocal = K.vocalSeparation();
    M.audios.push(material);
    M.speeds.push(speed);
    M.sound_channel_mappings.push(mapping);
    M.beats.push(beats);
    M.vocal_separations.push(vocal);

    voiceTrack.segments.push(
      K.audioTrackSegment({
        materialId: material.id,
        startUs: secToUs(seg.start),
        durationUs,
        extraRefs: [speed.id, beats.id, mapping.id, vocal.id],
        renderIndex: i,
      }),
    );
  });

  // ---- Nhac nen: lap lai cho phu do dai video, ha am luong ----
  if (music?.file && fs.existsSync(music.file)) {
    const musicTrack = K.newTrack('audio');
    draft.tracks.push(musicTrack);
    const loopUs = secToUs(music.duration || 0);
    const totalUs = secToUs(timeline.duration);
    if (loopUs > 0) {
      let cursor = 0;
      let i = 0;
      while (cursor < totalUs && i < 200) {
        const durationUs = Math.min(loopUs, totalUs - cursor);
        const material = K.audioMaterial({
          file: capcutPath(music.file),
          duration: loopUs,
          name: path.basename(music.file),
        });
        const speed = K.speedMaterial();
        const mapping = K.soundChannelMapping(true);
        const beats = K.beatsMaterial();
        const vocal = K.vocalSeparation();
        M.audios.push(material);
        M.speeds.push(speed);
        M.sound_channel_mappings.push(mapping);
        M.beats.push(beats);
        M.vocal_separations.push(vocal);
        musicTrack.segments.push(
          K.audioTrackSegment({
            materialId: material.id,
            startUs: cursor,
            durationUs,
            extraRefs: [speed.id, beats.id, mapping.id, vocal.id],
            volume: music.volume ?? 0.18,
            renderIndex: i,
          }),
        );
        cursor += durationUs;
        i += 1;
      }
    }
  }

  // ---- Phu de trong draft (tuy chon; file .srt luon duoc xuat rieng) ----
  if (subtitles) {
    const textTrack = K.newTrack('text');
    draft.tracks.push(textTrack);
    timeline.audioSegments.forEach((seg, i) => {
      const material = K.textMaterial({ content: seg.text });
      const mapping = K.soundChannelMapping();
      M.texts.push(material);
      M.sound_channel_mappings.push(mapping);
      textTrack.segments.push(
        K.textSegment({
          materialId: material.id,
          startUs: secToUs(seg.start),
          durationUs: secToUs(seg.duration),
          extraRefs: [mapping.id],
          renderIndex: 14000 + i,
        }),
      );
    });
  }

  draft.duration = secToUs(timeline.duration);
  return { draft, missing };
}

/** Ghi thu muc draft ma CapCut doc duoc. */
export function writeDraftFolder({ draft, draftDir, name, timeline }) {
  const folder = path.join(draftDir, name);
  ensureDir(folder);
  const nowUs = Date.now() * 1000;
  const folderPath = capcutPath(folder);

  writeJson(path.join(folder, 'draft_content.json'), draft);
  writeJson(path.join(folder, 'draft_meta_info.json'), {
    cloud_package_completed_time: '',
    draft_cloud_capcut_purchase_info: '',
    draft_cloud_last_action_download: false,
    draft_cloud_materials: [],
    draft_cloud_purchase_info: '',
    draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '',
    draft_cover: `${folderPath}/draft_cover.jpg`,
    draft_deeplink_url: '',
    draft_enterprise_info: {
      draft_enterprise_extra: '',
      draft_enterprise_id: '',
      draft_enterprise_name: '',
      enterprise_material: null,
    },
    draft_fold_path: folderPath,
    draft_id: draft.id,
    draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false,
    draft_is_ai_translate: false,
    draft_is_article_video_draft: false,
    draft_is_from_deeplink: 'false',
    draft_is_invisible: false,
    draft_materials: [
      { type: 0, value: [] },
      { type: 1, value: [] },
      { type: 2, value: [] },
      { type: 3, value: [] },
      { type: 6, value: [] },
      { type: 7, value: [] },
      { type: 8, value: [] },
    ],
    draft_materials_copied_info: [],
    draft_name: name,
    draft_new_version: '',
    draft_removable_storage_device: '',
    draft_root_path: capcutPath(draftDir),
    draft_segment_extra_info: [],
    draft_timeline_materials_size_: 0,
    draft_type: '',
    tm_draft_cloud_completed: '',
    tm_draft_cloud_modified: 0,
    tm_draft_create: nowUs,
    tm_draft_modified: nowUs,
    tm_draft_removed: 0,
    tm_duration: secToUs(timeline.duration),
  });

  return folder;
}

export { US };
