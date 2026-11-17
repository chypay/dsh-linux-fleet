import { Context } from '@deepseek-ai/cordis';
import * as _deepseek_ai_cosmokit from '@deepseek-ai/cosmokit';
import Schema from '@deepseek-ai/schemastery';

/** 一台远程 Linux 服务器的连接信息 */
interface ServerConfig {
    /** 别名，工具调用时用它指代服务器 */
    name: string;
    host: string;
    port: number;
    user: string;
    /** 本机上的 SSH 私钥绝对路径 */
    privateKeyPath: string;
}
/** 插件配置（由 Cordis Schema 校验并填充默认值） */
interface Config {
    servers: ServerConfig[];
    /** 运行时服务器清单文件；留空则使用 $DSH_HOME/linux-fleet.json */
    dataFile: string;
    connectTimeout: number;
    commandTimeout: number;
    /** 单条命令 stdout/stderr 各自的最大保留字节数 */
    commandMaxBytes: number;
    /** true = 每次启动都用 Cordis 配置覆盖运行时清单 */
    preferConfig: boolean;
    /** 在内置黑名单之外追加的自定义高危命令正则 */
    extraBlockedPatterns: string[];
}
declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    servers: Schema<({
        name?: string | null | undefined;
        host?: string | null | undefined;
        port?: number | null | undefined;
        user?: string | null | undefined;
        privateKeyPath?: string | null | undefined;
    } & _deepseek_ai_cosmokit.Dict)[], Schemastery.ObjectT<NoInfer<{
        name: Schema<string, string, "defined">;
        host: Schema<string, string, "defined">;
        port: Schema<number, number, "defined">;
        user: Schema<string, string, "defined">;
        privateKeyPath: Schema<string, string, "defined">;
    }>>[], "defined">;
    dataFile: Schema<string, string, "defined">;
    connectTimeout: Schema<number, number, "defined">;
    commandTimeout: Schema<number, number, "defined">;
    commandMaxBytes: Schema<number, number, "defined">;
    preferConfig: Schema<boolean, boolean, "defined">;
    extraBlockedPatterns: Schema<string[], string[], "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    servers: Schema<({
        name?: string | null | undefined;
        host?: string | null | undefined;
        port?: number | null | undefined;
        user?: string | null | undefined;
        privateKeyPath?: string | null | undefined;
    } & _deepseek_ai_cosmokit.Dict)[], Schemastery.ObjectT<NoInfer<{
        name: Schema<string, string, "defined">;
        host: Schema<string, string, "defined">;
        port: Schema<number, number, "defined">;
        user: Schema<string, string, "defined">;
        privateKeyPath: Schema<string, string, "defined">;
    }>>[], "defined">;
    dataFile: Schema<string, string, "defined">;
    connectTimeout: Schema<number, number, "defined">;
    commandTimeout: Schema<number, number, "defined">;
    commandMaxBytes: Schema<number, number, "defined">;
    preferConfig: Schema<boolean, boolean, "defined">;
    extraBlockedPatterns: Schema<string[], string[], "defined">;
}>>, "plain">;

declare const name = "dsh-linux-fleet";
declare const inject: string[];
declare function apply(ctx: Context, config: Config): void;

export { Config, apply, inject, name };
