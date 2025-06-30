import { SDK, SDKConfig } from "../index";

let sdk = new SDK();
let config: SDKConfig = {
  application_id: "machhub_admin",
  natsUrl: "nats://localhost:4222",
};

(async () => {
  await sdk.Initialize(config);

  function add10(data: Record<string,any>): Record<string,any>{
      data.result = data.a + 10;
      console.log("Function add executed with data:", data);
      return data
  }

  sdk.function.addFunction("add", add10);

  await sdk.function.initializeFunctions();
})();