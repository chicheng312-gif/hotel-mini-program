export type CloudResult<T> = T & { ok?: boolean; error?: string };

export async function callCloud<T extends Record<string, unknown>>(
  name: string,
  data: Record<string, unknown>
): Promise<CloudResult<T>> {
  const res = await wx.cloud.callFunction({ name, data });
  const result = (res.result || {}) as CloudResult<T>;
  return result;
}
