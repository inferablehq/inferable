export function validateToolName(name: string) {
  if (!name) {
    throw new Error("Tool name is required");
  }

  // must be 30 characters or less
  if (name.length > 30) {
    throw new Error("Tool name must be 50 characters or less");
  }

  // allows alphanumeric, and dots
  if (!/^[a-zA-Z0-9.]+$/.test(name)) {
    throw new Error(`Tool name must be alphanumeric and can contain dots, got ${name}`);
  }
}

export function validateToolGroup(group: string) {
  if (!group) {
    throw new Error("Tool group is required");
  }

  // must be 30 characters or less
  if (group.length > 30) {
    throw new Error("Tool group must be 30 characters or less");
  }

  // allows alphanumeric, and dots
  if (!/^[a-zA-Z0-9.]+$/.test(group)) {
    throw new Error(`Tool group must be alphanumeric and can contain dots, got ${group}`);
  }
}
