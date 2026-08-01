declare module 'exif-parser' {
  export interface ExifTags {
    Make?: string;
    Model?: string;
    /** Unix timestamp in seconds (exif-parser's own casting, see lib/date.js). */
    DateTimeOriginal?: number;
    /** Unix timestamp in seconds — fallback when DateTimeOriginal is absent. */
    CreateDate?: number;
    [key: string]: unknown;
  }

  export interface ExifParseResult {
    tags: ExifTags;
  }

  export interface ExifParserInstance {
    parse(): ExifParseResult;
  }

  const ExifParser: {
    create(buffer: ArrayBuffer | Uint8Array): ExifParserInstance;
  };

  export default ExifParser;
}
