export interface RecordID {
    Table: string;
    ID: string;
}

export function StringToRecordID(id: string): RecordID {
    const splitID = id.split(":");
    if (splitID.length != 2) return emptyRecordID();
    return {
        Table: containsSpace(splitID[0]) ? `(${splitID[0]})` : splitID[0],
        ID: splitID[1]
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
