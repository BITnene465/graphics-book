/** 只映射示意图的语义色；纹理和算法生成的 RGB 像素保持原值。 */
const colors: Record<string, string> = {
  '#397baf': '#58c4dd',
  '#237e79': '#83c167',
  '#b88036': '#f4d66a',
  '#b95160': '#fc6255',
  '#334b50': '#e7edf5',
  '#8fa29d': '#71849a',
};
export const plotColor = (color: string): string => colors[color.toLowerCase()] ?? color;
export const axisColors = ['#58c4dd', '#83c167', '#fc6255'] as const;
export const stageColor = '#111824';
