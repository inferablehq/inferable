const pack = (value: unknown) => {
  const storable = JSON.stringify({ value });
  return storable;
};

const unpack = (value: string) => {
  try {
    const { value: unpacked } = JSON.parse(value);
    return unpacked;
  } catch (err) {
    return {
      value: `Error unpacking value: ${err}`,
      original: value,
    };
  }
};

export const packer = {
  pack,
  unpack,
};
