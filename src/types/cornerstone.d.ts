/**
 * Type declarations for Cornerstone modules that ship without TypeScript definitions.
 * These are used by dynamic imports in transcodeDicomToSupported.ts and cornerstone.ts.
 */

declare module '@cornerstonejs/dicom-codec' {
  const codec: {
    transcode(
      encapsulatedFrame: Uint8Array,
      imageInfo: unknown,
      transferSyntaxUid: string,
      targetTransferSyntaxUid: string
    ): Promise<{ imageFrame: Uint8Array; imageInfo: unknown }>;
  };
  export default codec;
}
