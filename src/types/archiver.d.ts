declare module "archiver" {
  const archiver: (format: "zip", options?: { zlib?: { level?: number } }) => {
    append: (source: string | Buffer, options?: { name: string }) => unknown;
    on: (event: string, listener: (...args: any[]) => void) => unknown;
    finalize: () => void;
  };
  export default archiver;
}
