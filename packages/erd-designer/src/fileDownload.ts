const INVALID_FILENAME_CHARS = /[/\\?%*:|"<>]/g;

/** 파일명 베이스 정리. Excel 보내기와 같은 규칙을 쓴다. */
export function sanitizeFileBase(name: unknown, fallback: string): string {
    const raw = typeof name === "string" ? name.trim() : "";
    const cleaned = raw
        .replace(INVALID_FILENAME_CHARS, "")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^\.+|\.+$/g, "")
        .trim();
    return cleaned.slice(0, 120) || fallback;
}

/** `{base}_{YYYY-MM-DD}.json`으로 브라우저 다운로드. */
export function downloadJsonFile(json: string, base: string): void {
    if (typeof window === "undefined") return;
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}_${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
}
