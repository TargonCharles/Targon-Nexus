// ---------------------------------------------------------------------------
// ARP UI — barrel export
// ---------------------------------------------------------------------------
// Shared React components for the Targon Nexus.
//
// Component summary:
//   SearchBar            – Full-text / faceted search input with autocomplete
//   GraphCanvas          – Force-directed D3 knowledge-graph renderer
//   EntityCard           – Compact summary card for any domain entity
//   PersonProfile        – Rich profile view for a Person entity
//   LabProfile           – Rich profile view for a Lab entity
//   EquipmentCard        – Compact equipment summary with specs
//   Timeline             – Chronological event / discovery timeline
//   EvidenceBadge        – Shows evidence count, source type, & quality tier
//   ConfidenceIndicator  – Visual confidence score (0–1) as bar / ring
//   FilterPanel          – Sidebar filter controls for search results
//   EntitySearchResult   – Single row in a search result list
//
// Types re-exported for convenience:
//   SearchBarProps, GraphCanvasProps, EntityCardProps,
//   PersonProfileProps, LabProfileProps, EquipmentCardProps,
//   TimelineProps, EvidenceBadgeProps, ConfidenceIndicatorProps,
//   FilterPanelProps, EntitySearchResultProps
// ---------------------------------------------------------------------------

// -- Components ---------------------------------------------------------------

export { SearchBar } from "./components/SearchBar";
export type { SearchBarProps } from "./components/SearchBar";

export { GraphCanvas } from "./components/GraphCanvas";
export type { GraphCanvasProps } from "./components/GraphCanvas";

export { EntityCard } from "./components/EntityCard";
export type { EntityCardProps } from "./components/EntityCard";

export { PersonProfile } from "./components/PersonProfile";
export type { PersonProfileProps } from "./components/PersonProfile";

export { LabProfile } from "./components/LabProfile";
export type { LabProfileProps } from "./components/LabProfile";

export { EquipmentCard } from "./components/EquipmentCard";
export type { EquipmentCardProps } from "./components/EquipmentCard";

export { Timeline } from "./components/Timeline";
export type { TimelineProps } from "./components/Timeline";

export { EvidenceBadge } from "./components/EvidenceBadge";
export type { EvidenceBadgeProps } from "./components/EvidenceBadge";

export { ConfidenceIndicator } from "./components/ConfidenceIndicator";
export type { ConfidenceIndicatorProps } from "./components/ConfidenceIndicator";

export { FilterPanel } from "./components/FilterPanel";
export type { FilterPanelProps } from "./components/FilterPanel";

export { EntitySearchResult } from "./components/EntitySearchResult";
export type { EntitySearchResultProps } from "./components/EntitySearchResult";

// -- Named sub-path convenience aggregators ----------------------------------

/**
 * All profile–family components.
 *   - PersonProfile, LabProfile
 */
export {
  PersonProfile,
  LabProfile,
} from "./components";

/**
 * All card–family components.
 *   - EntityCard, EquipmentCard, EntitySearchResult
 */
export { EntityCard, EquipmentCard, EntitySearchResult } from "./components";

/**
 * All visual indicator components.
 *   - EvidenceBadge, ConfidenceIndicator
 */
export { EvidenceBadge, ConfidenceIndicator } from "./components";
