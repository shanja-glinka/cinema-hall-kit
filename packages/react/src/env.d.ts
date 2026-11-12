// Bundlers replace `process.env.NODE_ENV`; declared here so the package does not depend on @types/node.
declare const process: { env: { NODE_ENV?: string } };
