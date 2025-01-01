import { ulid } from "ulid";
import { parseMessage } from ".";
import { createOwner } from "../test/util";
import { buildMessageBody } from "./test.util";


describe("parseMessage", () => {
  const clusterId = ulid();
  const organizationId = ulid();

  beforeAll(async () => {
    await createOwner({
      clusterId,
      organizationId,
    });
  })

  it("should parse a message ingestion event", async () => {
    const result = await parseMessage(buildMessageBody({
      from: "test@example.com",
      to: [ `${clusterId}@run.inferable.ai` ],
      subject: "Subject",
      body: "What tools are available",
      messageId: "<93FC27CD-9054-4BB5-ADA9-C9CB425D3844@johnjcsmith.com>"
    }));

    expect(result).toBeDefined();
    expect(result.clusterId).toBe(clusterId);
    expect(result.source).toBe("test@example.com");
    expect(result.subject).toBe("Subject");
    expect(result.body).toContain("What tools are available");
    expect(result.messageId).toEqual("<93FC27CD-9054-4BB5-ADA9-C9CB425D3844@johnjcsmith.com>");
  });

  it("should fail with multiple '@run.inferable.ai' addresses", async () => {
    await expect(parseMessage(buildMessageBody({
      from: "test@example.com",
      to: [ "12343@run.inferable.ai", `${clusterId}@run.inferable.ai` ],
      subject: "Subject",
      body: "What tools are available",
      messageId: "<93FC27CD-9054-4BB5-ADA9-C9CB425D3844@johnjcsmith.com>"
    }))).rejects.toThrow("Found multiple Inferable email addresses in destination");
  })

  it("should fail with no '@run.inferable.ai' addresses", async () => {
    await expect(parseMessage(buildMessageBody({
      from: "test@example.com",
      to: [ "something@else.com" ],
      subject: "Subject",
      body: "What tools are available",
      messageId: "<93FC27CD-9054-4BB5-ADA9-C9CB425D3844@johnjcsmith.com>"
    }))).rejects.toThrow("Could not extract clusterId from email address");
  })

})
