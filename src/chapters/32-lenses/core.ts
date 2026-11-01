export function imageDistance(focal: number, objectDistance: number): number {
  if (focal <= 0 || objectDistance <= focal) throw new RangeError('当前实像模型要求物距大于焦距');
  return (focal * objectDistance) / (objectDistance - focal);
}
/** 所有长度使用同一单位；返回传感器上的弥散圆直径。 */
export function circleOfConfusion(
  focal: number,
  fNumber: number,
  focusDistance: number,
  objectDistance: number,
): number {
  if (fNumber <= 0) throw new RangeError('光圈数必须为正');
  const sensor = imageDistance(focal, focusDistance),
    image = imageDistance(focal, objectDistance);
  return (focal / fNumber) * Math.abs(1 - sensor / image);
}
export function lensRay(
  focal: number,
  objectDistance: number,
  height: number,
  apertureY: number,
  sensorDistance: number,
) {
  const image = imageDistance(focal, objectDistance),
    imageY = (-height * image) / objectDistance;
  return { image, imageY, sensorY: apertureY + ((imageY - apertureY) * sensorDistance) / image };
}
