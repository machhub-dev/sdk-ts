import { RecordID } from "./recordID.models.js";

export type ProcessLanguage = "python" | "typescript";

export type TriggerType = "tag_change" | "interval" | "cron" | "http" | "manual";

export interface TriggerConfig {
  cron_expression?: string;
  interval_value?: number;
  interval_unit?: string;
  tag?: string;
  endpoint?: string;
}

export interface ProcessTrigger {
  type: TriggerType;
  config: TriggerConfig;
}

export type InputType = "tag" | "sql";

export interface InputConfig {
  tag?: string;
  query?: string;
}

export interface ProcessInput {
  name: string;
  type: InputType;
  config: InputConfig;
}

export type OutputType = "sql" | "tag_write";

export interface OutputConfig {
  query?: string;
  tag?: string;
  field?: string;
}

export interface ProcessOutput {
  type: OutputType;
  config: OutputConfig;
}

export interface ProcessKey {
  key: string;
}

export interface ProcessValue {
  value: string;
}

export interface Process {
  id?: RecordID;
  domain_id?: RecordID;
  name: string;
  enabled: boolean;
  log_enabled: boolean;
  language: ProcessLanguage;
  code: string;
  version: number;
  triggers: ProcessTrigger[];
  inputs: ProcessInput[];
  outputs: ProcessOutput[];
  keys?: ProcessKey[];
  values?: ProcessValue[];
  createdBy?: RecordID;
  createdDt?: string;
  updated_dt?: string;
}
