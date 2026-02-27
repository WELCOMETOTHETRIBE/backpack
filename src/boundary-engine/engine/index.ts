export { isServiceActive } from "./evaluateGates";
export { allocateControls } from "./allocateControls";
export { computeSensitivityWarnings } from "./sensitivityWarnings";
export { computeAllocationHash } from "./allocationHash";
export { getProviderCapabilityMatrix } from "./capabilityMatrix";
export { detectBoundaryDrift } from "./drift";
export {
  exportAllocationSnapshot,
  type ExportSnapshotParams,
  type ExportSnapshotResult,
  type SnapshotMetadata,
} from "./exportSnapshot";
