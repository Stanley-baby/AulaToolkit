// `--vendor-exes=off|on`: started elevated to rename the vendor exes, then exits. Imported first in index.ts.
import { renameVendorExecutablesNow } from './vendorSoftware';

const arg = process.argv.find((a) => a.startsWith('--vendor-exes='));
if (arg) process.exit(renameVendorExecutablesNow(arg.endsWith('=on')) ? 0 : 1);
