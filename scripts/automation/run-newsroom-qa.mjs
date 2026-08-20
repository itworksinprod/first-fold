import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNewsroomQa } from "./newsroom-qa.mjs";

const scriptPath = fileURLToPath(import.meta.url);

function failedResult(code, pathValue, message, checkedAt = null) {
  return {
    sourceCheck: {
      status: "failed",
      checkedAt,
      checkedSourceCount: 0,
      issues: [
        {
          code,
          severity: "error",
          path: pathValue,
          message,
        },
      ],
    },
  };
}

function parseArguments(argumentsList) {
  const options = {
    checkLinks: false,
    timeoutMs: 5_000,
    checkedAt: null,
  };
  let editionPath = null;
  let allowlistPath = null;
  let priorEditionsPath = null;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--check-links") {
      options.checkLinks = true;
    } else if (argument === "--timeout-ms") {
      options.timeoutMs = Number(argumentsList[++index]);
    } else if (argument === "--checked-at") {
      options.checkedAt = argumentsList[++index] ?? null;
    } else if (argument === "--allowed-sources") {
      allowlistPath = argumentsList[++index] ?? null;
    } else if (argument === "--prior-editions") {
      priorEditionsPath = argumentsList[++index] ?? null;
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown option ${argument}.`);
    } else if (editionPath === null) {
      editionPath = argument;
    } else {
      throw new Error("Only one edition JSON file may be checked.");
    }
  }

  if (!editionPath) {
    throw new Error(
      "Usage: node scripts/automation/run-newsroom-qa.mjs EDITION.json [--allowed-sources SOURCES.json] [--prior-editions EDITIONS.json] [--check-links] [--timeout-ms 5000] [--checked-at ISO_INSTANT]",
    );
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw new Error("--timeout-ms must be a positive integer.");
  }
  return { editionPath, allowlistPath, priorEditionsPath, options };
}

async function readJson(filename, label) {
  try {
    return JSON.parse(await readFile(path.resolve(filename), "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${label} ${filename}: ${error.message}`);
  }
}

export async function runCli(argumentsList = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArguments(argumentsList);
  } catch (error) {
    return failedResult("CLI_ARGUMENT_INVALID", "$", error.message);
  }

  try {
    const edition = await readJson(parsed.editionPath, "edition");
    if (parsed.allowlistPath) {
      parsed.options.allowedSourceUrls = await readJson(
        parsed.allowlistPath,
        "source allowlist",
      );
    }
    if (parsed.priorEditionsPath) {
      const priorEditions = await readJson(
        parsed.priorEditionsPath,
        "prior editions",
      );
      const priorEditionList = Array.isArray(priorEditions)
        ? priorEditions
        : priorEditions.editions;
      if (!Array.isArray(priorEditionList)) {
        throw new Error("Prior-editions input must be an array or an object with an editions array.");
      }
      parsed.options.priorEditions = priorEditionList;
    }
    return runNewsroomQa(edition, parsed.options);
  } catch (error) {
    return failedResult(
      "CLI_INPUT_INVALID",
      "$",
      error.message,
      parsed.options.checkedAt,
    );
  }
}

async function main() {
  const result = await runCli();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.sourceCheck.status !== "passed") {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    process.stdout.write(
      `${JSON.stringify(failedResult("QA_INTERNAL_ERROR", "$", error.message), null, 2)}\n`,
    );
    process.exitCode = 1;
  });
}
