require("@testing-library/jest-dom");

// Mock Headers if not available in test environment
if (typeof Headers === "undefined") {
  global.Headers = class Headers {
    constructor() {
      return {};
    }
  };
}
