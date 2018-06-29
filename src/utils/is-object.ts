export default function isObject(value?: any): boolean {
  return ((value !== null) && (typeof value === 'object'));
}
