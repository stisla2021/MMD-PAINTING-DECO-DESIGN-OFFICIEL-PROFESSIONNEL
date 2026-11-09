import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export function createJsonStore(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });

  if (!existsSync(filePath)) {
    writeFileSync(filePath, "[]\n", "utf8");
  }

  function writeRecords(records) {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });

    try {
      renameSync(temporaryPath, filePath);
    } catch (error) {
      try {
        unlinkSync(temporaryPath);
      } catch {
        // Preserve the original rename error.
      }
      throw error;
    }
  }

  return {
    readAll() {
      const contents = readFileSync(filePath, "utf8");
      const records = JSON.parse(contents);

      if (!Array.isArray(records)) {
        throw new Error(`Expected a JSON array in ${filePath}`);
      }

      return records;
    },

    append(record) {
      const records = this.readAll();
      records.push(record);
      writeRecords(records);
      return record;
    },

    replaceAll(records) {
      writeRecords(records);
    },
  };
}
