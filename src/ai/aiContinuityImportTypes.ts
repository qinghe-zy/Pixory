export type AiContinuityImportSourceKind = 'pixory_native_markdown' | 'external_markdown' | 'external_text';

export type AiContinuityImportReviewGateState =
  | 'not_required'
  | 'pending_review'
  | 'accepted'
  | 'failed'
  | 'rolled_back';

export type AiContinuityImportRollbackState = 'available' | 'locked' | 'rolled_back';

export type AiContinuitySyntheticMessageKind = 'continuity_import_root' | 'continuity_import_milestone';
