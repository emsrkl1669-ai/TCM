export async function safeParseJson<T = Record<string, unknown>>(
  res: Response,
): Promise<T & { error?: string }> {
  const raw = await res.text();
  if (!raw) return {} as T & { error?: string };
  try {
    return JSON.parse(raw) as T & { error?: string };
  } catch {
    if (res.status === 404) {
      return {
        error: 'ไม่พบการเชื่อมต่อบริการหลังบ้าน (HTTP 404) กรุณารีเฟรชหน้าเว็บแล้วลองใหม่อีกครั้ง',
      } as T & { error?: string };
    }
    return {
      error: res.ok
        ? 'ข้อมูลตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง'
        : `เซิร์ฟเวอร์ไม่ตอบสนองตามปกติ (HTTP ${res.status})`,
    } as T & { error?: string };
  }
}
