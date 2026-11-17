/**
 * 高危命令黑名单。
 * 只作用于 linux_exec_cmd 这类自由命令入口；受控工具（systemctl/journalctl 等）
 * 使用白名单动作，不走这里。
 */
interface GuardResult {
    blocked: boolean;
    reason?: string;
    pattern?: string;
}
declare function createCommandGuard(extraPatterns?: string[]): {
    check(command: string): GuardResult;
};
declare function checkUploadPath(path: string): string | null;

export { type GuardResult, checkUploadPath, createCommandGuard };
