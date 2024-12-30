import { signedHeaders } from "./valtown";

describe("Val.town Integration", () => {
  describe("signedHeaders", () => {
    it("should sign headers", async () => {
      const result = signedHeaders({
        body: JSON.stringify({ test: "value" }),
        method: "GET",
        path: "/meta",
        secret: "secret",
        timestamp: "819118800000",
      });

      expect(result).toStrictEqual({
        "X-Signature": "126f621ef1898cba0c6b0c0bd74d443c6004e7c3291a6432f90a233db903c8d8",
        "X-Timestamp": "819118800000",
      });
    });
  });
});
