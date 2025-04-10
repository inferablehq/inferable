const pack = (value: unknown) => {
  const storable = JSON.stringify({ value });
  return storable;
};

const unpack = (value: string): unknown => {
  try {
    const { value: unpacked } = JSON.parse(value);
    return unpacked;
  } catch (err) {
    throw new Error(
      `Failed to unpack value: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

export const packer = {
  pack,
  unpack,
};
