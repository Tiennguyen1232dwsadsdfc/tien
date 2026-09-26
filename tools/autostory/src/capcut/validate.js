import fs from 'node:fs';

/**
 * Kiem tra mot draft truoc khi mo CapCut.
 * Muc dich: bat loi ngay tai day thay vi de nguoi dung mo CapCut roi thay
 * timeline trong hoac clip nhay cho.
 */
export function validateDraft(draft) {
  const problems = [];
  const warnings = [];

  const tracks = draft.tracks || [];
  const video = tracks.find((t) => t.type === 'video');
  const audios = tracks.filter((t) => t.type === 'audio');

  if (!video?.segments?.length) problems.push('Track anh trong — khong co clip nao.');
  if (!audios.length || !audios[0].segments?.length) problems.push('Track giong doc trong.');

  // Moi material duoc tham chieu phai ton tai.
  const ids = new Set();
  for (const group of Object.values(draft.materials || {})) {
    if (Array.isArray(group)) for (const item of group) if (item?.id) ids.add(item.id);
  }
  for (const track of tracks) {
    for (const seg of track.segments || []) {
      if (!ids.has(seg.material_id)) problems.push(`Segment ${seg.id} tro toi material khong ton tai.`);
      for (const ref of seg.extra_material_refs || []) {
        if (!ids.has(ref)) problems.push(`Segment ${seg.id} co extra_material_ref treo: ${ref}`);
      }
    }
  }

  // File tren dia phai co that, neu khong CapCut se hien clip do.
  for (const group of ['videos', 'audios']) {
    for (const item of draft.materials?.[group] || []) {
      if (item.path && !fs.existsSync(item.path)) problems.push(`Thieu file: ${item.path}`);
    }
  }

  // Track anh phai lien tuc, khong ho va khong chong nhau.
  if (video?.segments?.length) {
    const sorted = [...video.segments].sort((a, b) => a.target_timerange.start - b.target_timerange.start);
    let cursor = 0;
    sorted.forEach((seg, i) => {
      const { start, duration } = seg.target_timerange;
      if (start > cursor) warnings.push(`Khe ho ${((start - cursor) / 1000).toFixed(1)}ms truoc clip ${i + 1}`);
      if (start < cursor) problems.push(`Clip ${i + 1} chong len clip truoc ${((cursor - start) / 1000).toFixed(1)}ms`);
      if (duration <= 0) problems.push(`Clip ${i + 1} co do dai 0`);
      cursor = start + duration;
    });
    if (Math.abs(cursor - draft.duration) > 1000) {
      warnings.push(`Track anh dai ${(cursor / 1e6).toFixed(2)}s nhung draft khai ${(draft.duration / 1e6).toFixed(2)}s`);
    }
  }

  // Keyframe phai nam trong pham vi clip.
  for (const seg of video?.segments || []) {
    for (const kf of seg.common_keyframes || []) {
      for (const point of kf.keyframe_list || []) {
        if (point.time_offset < 0 || point.time_offset > seg.target_timerange.duration) {
          problems.push(`Keyframe ${kf.property_type} nam ngoai clip ${seg.id}`);
        }
      }
    }
  }

  return { ok: problems.length === 0, problems, warnings };
}
