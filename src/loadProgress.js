export const BOOT_STAGES = [
  { label: 'проверка WebGL', weight: 1 },
  { label: 'генерация города', weight: 4 },
  { label: 'трафик и спидеры', weight: 2 },
  { label: 'компиляция шейдеров', weight: 2 },
  { label: 'загрузка звука', weight: 2 },
  { label: 'первый кадр', weight: 1 },
];

export function stageProgress(stages, index) {
  const total = stages.reduce((sum, stage) => sum + stage.weight, 0);
  const clamped = Math.max(0, Math.min(index, stages.length - 1));
  let done = 0;
  for (let i = 0; i <= clamped; i += 1) done += stages[i].weight;
  return done / total;
}
