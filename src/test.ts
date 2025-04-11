import { SDK } from "./index";

async function main() {
    const sdk = new SDK();

    // // // Initialize the SDK
    await sdk.Initialize("machhub_admin", "http://localhost:6188");

    // // 1. Collection // //

    // // Create a new record
    // const newRecord = { name: "Test Record", value: 42 };
    // const createdRecord = await testCollection.create(newRecord);
    // console.log("Created Record:", createdRecord);

    // // Fetch all records
    // const allRecords = await testCollection.getAll();
    // console.log("All Records:", allRecords);

    // // Fetch a single record by ID
    // const recordId = `${createdRecord.id.Table}:${createdRecord.id.ID}`;
    // const singleRecord = await testCollection.getOne(recordId);
    // console.log("Single Record:", singleRecord);

    // // Update a record
    // const updatedData = { name: "Updated Record", value: 84 };
    // const updatedRecord = await testCollection.update(recordId, updatedData);
    // console.log("Updated Record:", updatedRecord);

    // // Delete a record
    // await testCollection.delete(recordId);
    // console.log(`Deleted Record with ID: ${recordId}`);

    // Apply filters, sorting, limit, and offset
    const filteredRecords = await sdk.collection("test-collection")
        .filter("value", ">", -1)
        .filter("name", "!=", "HELLO3").
        getAll()
    console.log("Filtered Records:", filteredRecords);
    // TODO : Try to access the json or if value is json

    const filteredRecords2 = await sdk.collection("test-collection")
    .sort("name", "desc").getAll()
    console.log("Filtered Records2:", filteredRecords2);

    
    const filteredRecords3 = await sdk.collection("test-collection")
    .limit(1)
    .getAll();
    console.log("Filtered Records3:", filteredRecords3);

    const filteredRecords4 = await sdk.collection("test-collection")
    .offset(2)
    .getAll();
    console.log("Filtered Records4:", filteredRecords4);

    const filteredRecords5 = await sdk.collection("test-collection")
    .filter("value", ">", 1)
    .sort("name", "asc")
    .limit(2)
    .getAll();
    console.log("Filtered Records5:", filteredRecords5);

    // // // 2. Historian // //
    // const historian = sdk.historian;

    // // Fetch all tags
    // const historizedTags = await historian.getAllHistorizedTags();
    // console.log("All Historized Tags:", historizedTags);

    // // Fetch historical data for a specific tag
    // const tagTopic = "Advance Chemicals Sdn Bhd/Meru Plant/Stamping/Machine 1/Status";
    // const startDate = "2023-01-01T00:00:00Z";
    // const historicalData = await historian.getHistoricalData(tagTopic, startDate);
    // console.log("Historical Data:", historicalData);

    // // Subscribe to live tag data updates
    // historian.subscribeLiveData(tagTopic, (data) => {
    //     console.log("Live Data Update:", data);
    // });

    // // // 3. Tag

    // // Fetch all tags
    // const allTagList = await sdk.tag.getAllTags();
    // console.log("All Tags:", allTagList);

    // // Publish a message to a topic
    // sdk.tag.publish("example-tag", { data: "Hello MQTT" });

    // // Subscribe to a topic
    // sdk.tag.subscribe("example-tag", (message) => {
    //     console.log("Received MQTT message:", message);
    // });

    // // 4.  Flows
    // let res =  await sdk.flow.executeFlow("flows:8pcbybrbkhnxl2noe9ry", {"a":10, "b":5})
    // console.log("res:", res)


    // // 5. Function
    // let res2 = await sdk.function.executeFunction("typescript", "add", {"a":10, "b":5})
    // console.log("res2: ", res2)

    // await sdk.function.executeFunction("typescript", "add", {"a":10, "b":5})

    // function add(data: { [key: string]: any }): {[key: string]: any }{ 
    //     data.a_plus_b = data.a + data.b
    //     return data
    // }

    // sdk.function.addFunction("add", add)
    // let initFuncRes = sdk.function.initializeFunctions()
    // console.log(initFuncRes)

    // setTimeout(async function(){
    //     let addRes = await sdk.function.executeFunction("typescript", "add", {a:1, b:3})
    //     console.log(addRes)
    // }, 2000);

    // 6. Auth
    let loginRes = await sdk.auth.login("admin","admin")
    console.log(loginRes)

}

main().catch(console.error);