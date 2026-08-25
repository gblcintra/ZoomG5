export function pack7Bit(data: number[]): number[] {
  const out: number[] = [];

  for (let i = 0; i < data.length; i += 7) {
    let msb = 0;
    const chunk = data.slice(i, i + 7);

    for (let j = 0; j < chunk.length; j++) {
      if (chunk[j] & 0x80) {
        msb |= 1 << j;
      }
    }

    out.push(msb);

    for (const value of chunk) {
      out.push(value & 0x7f);
    }
  }

  return out;
}

export function unpack7Bit(data: number[]): number[] {
  const out: number[] = [];

  for (let i = 0; i < data.length; i += 8) {
    const msb = data[i] ?? 0;

    for (let j = 0; j < 7; j++) {
      const value = data[i + j + 1];

      if (value === undefined) break;

      out.push(
        value | (((msb >> j) & 1) << 7)
      );
    }
  }

  return out;
}