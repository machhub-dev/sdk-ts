import * as fs from 'fs';
import * as path from 'path';

interface AppConfig {
  application_id: string;
}

export function getAppConfig(): AppConfig {
  console.log("getAppConfig")
  if (typeof process !== 'undefined' && process.env && process.env.APP_CONFIG_PATH) {
    // Node.js environment
    console.log(process.env)
    console.log(process.env.APP_CONFIG_PATH)

    const configPath = process.env.APP_CONFIG_PATH || path.resolve(__dirname, '../../../sdk.config.json');
    const rawData = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(rawData) as AppConfig;
  } else {
    try {
      const configPath = path.resolve('../../../sdk.config.json');
      console.log(configPath)
      const rawData = fs.readFileSync(configPath, 'utf-8');
      console.log("TEST")
      console.log(rawData)
      return JSON.parse(rawData) as AppConfig;
    } catch (e:any){
        throw new Error("Configuration not found. Set it via the APP_CONFIG_PATH environment variable : " + e);
    }
  }
}
