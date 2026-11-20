export interface RecordID {
    Table: string;
    ID: string;
}

/**
 * The ID part of a record ID as stored. SurrealDB prints an ID that is not plain
 * alphanumeric in brackets (domains:⟨plant-1⟩, or with backticks), while the
 * API's JSON RecordIDs carry the bare ID (plant-1).
 */
export function unescapeRecordIDPart(id: string): string {
    const bracketed = id.length >= 2 && ((id.startsWith("⟨") && id.endsWith("⟩")) || (id.startsWith("`") && id.endsWith("`")));
    if (!bracketed) return id;
    return id.slice(1, -1).replace(/\\(.)/g, "$1");
}

/** A "table:id" string in one form, so domains:⟨plant-1⟩ and domains:plant-1
 * compare equal. Strings with no table are returned as they are. */
export function normalizeRecordIDString(id: string): string {
    const at = id.indexOf(":");
    if (at < 0) return id;
    return id.slice(0, at) + ":" + unescapeRecordIDPart(id.slice(at + 1));
}

export function StringToRecordID(id: string): RecordID {
    const at = id.indexOf(":");
    if (at <= 0 || at === id.length - 1) return emptyRecordID();
    const table = id.slice(0, at);
    return {
        Table: containsSpace(table) ? `(${table})` : table,
        ID: unescapeRecordIDPart(id.slice(at + 1))
    };
}

export function RecordIDToString(recordID: RecordID | undefined): string {
    if (recordID != undefined) {
        return recordID.Table + ":" + recordID.ID;
    } else {
        return "";
    }
}

export function emptyRecordID(): RecordID {
    return {
        Table: "",
        ID: "",
    };
}

// Helper function to check if a string contains spaces
function containsSpace(s: string): boolean {
    return s.includes(" ");
}
