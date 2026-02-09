import * as esbuild from "esbuild";
import { Miniflare } from "miniflare";
import * as fs from "node:fs";
import * as path from "node:path";
import { watch } from "chokidar";

function parseDevVars(filePath: string): Record<string, string> {
	if (!fs.existsSync(filePath)) return {};
	const content = fs.readFileSync(filePath, "utf-8");
	const bindings: Record<string, string> = {};
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx === -1) continue;
		bindings[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
	}
	return bindings;
}

function parseArgs(): { entryPoint: string; port: number } {
	const args = process.argv.slice(2);
	let entryPoint = "./index.ts";
	let port = 1234;

	for (const arg of args) {
		if (arg.startsWith("--port=")) {
			port = Number.parseInt(arg.split("=")[1]!, 10);
		} else if (!arg.startsWith("--")) {
			entryPoint = arg;
		}
	}

	return { entryPoint: path.resolve(entryPoint), port };
}

const NODE_BUILTINS = [
	"assert", "buffer", "child_process", "crypto", "events", "fs", "http",
	"http2", "https", "net", "os", "path", "process", "querystring", "stream",
	"tls", "tty", "url", "util", "zlib",
].flatMap((m) => [m, `node:${m}`]);

const CF_BUILTINS = ["cloudflare:workers"];

async function bundle(entryPoint: string): Promise<string> {
	const resolveDir = path.dirname(entryPoint);
	const entryFile = path.basename(entryPoint);
	const result = await esbuild.build({
		stdin: {
			contents: `export { XTRNState } from "xtrn-server";\nexport { default } from "./${entryFile}";`,
			resolveDir,
			loader: "ts",
		},
		bundle: true,
		platform: "neutral",
		format: "esm",
		target: "es2020",
		write: false,
		sourcemap: "inline",
		mainFields: ["module", "main"],
		conditions: ["worker", "browser", "import"],
		external: [...NODE_BUILTINS, ...CF_BUILTINS],
	});

	return new TextDecoder().decode(result.outputFiles![0]!.contents);
}

async function startMiniflare(
	bundledCode: string,
	bindings: Record<string, string>,
	port: number,
): Promise<Miniflare> {
	const mf = new Miniflare({
		modules: true,
		script: bundledCode,
		bindings,
		port,
		compatibilityDate: "2025-01-01",
		compatibilityFlags: ["nodejs_compat"],
		durableObjects: { XTRN_STATE: "XTRNState" },
	});
	await mf.ready;
	return mf;
}

function printServerInfo(port: number, entryPoint: string): void {
	const dir = path.dirname(entryPoint);
	const base = path.basename(dir);
	const parent = path.basename(path.dirname(dir));
	console.log(`\n[xtrn dev] ${parent}/${base}`);
	console.log(`  Entry:  ${entryPoint}`);
	console.log(`  Server: http://localhost:${port}`);
	console.log(`  Routes: GET /details, POST /tools/*, POST /wind-down, GET /active-requests\n`);
}

async function main(): Promise<void> {
	const { entryPoint, port } = parseArgs();
	const entryDir = path.dirname(entryPoint);
	const devVarsPath = path.join(entryDir, ".dev.vars");
	const bindings = parseDevVars(devVarsPath);

	if (Object.keys(bindings).length > 0) {
		console.log(
			`[xtrn dev] Loaded ${Object.keys(bindings).length} binding(s) from .dev.vars`,
		);
	}

	let bundledCode = await bundle(entryPoint);
	let mf = await startMiniflare(bundledCode, bindings, port);

	printServerInfo(port, entryPoint);

	const watcher = watch(entryDir, {
		ignoreInitial: true,
		ignored: [/node_modules/, /\.dev\.vars$/],
	});

	watcher.on("change", async (changedPath) => {
		console.log(`[xtrn dev] Change detected: ${path.basename(changedPath)}`);
		try {
			bundledCode = await bundle(entryPoint);
			await mf.setOptions({
				modules: true,
				script: bundledCode,
				bindings,
				port,
				compatibilityDate: "2025-01-01",
				compatibilityFlags: ["nodejs_compat"],
				durableObjects: { XTRN_STATE: "XTRNState" },
			});
			console.log("[xtrn dev] Reloaded");
		} catch (err) {
			console.error("[xtrn dev] Reload failed:", err);
		}
	});

	const shutdown = async () => {
		console.log("\n[xtrn dev] Shutting down...");
		watcher.close();
		await mf.dispose();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

main().catch((err) => {
	console.error("[xtrn dev] Fatal:", err);
	process.exit(1);
});
