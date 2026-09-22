import { useAppStore } from "../../store/appStore";

export function FilterPanel() {
  const open = useAppStore((state) => state.filterPanelOpen);
  const tags = useAppStore((state) => state.projectFile.project.tags);
  const selectedTags = useAppStore((state) => state.filterTags);
  const behavior = useAppStore((state) => state.filterBehavior);
  const tagMode = useAppStore((state) => state.tagFilterMode);
  const toggleTag = useAppStore((state) => state.toggleFilterTag);
  const setBehavior = useAppStore((state) => state.setFilterBehavior);
  const setTagMode = useAppStore((state) => state.setTagFilterMode);
  const togglePanel = useAppStore((state) => state.toggleFilterPanel);
  const clear = useAppStore((state) => state.clearFilters);

  if (!open) return null;

  return (
    <section className="filter-panel" aria-label="Advanced filters">
      <div className="filter-panel-heading">
        <div><span>FILTER</span><strong>Canvas visibility</strong></div>
        <button type="button" onClick={togglePanel}>×</button>
      </div>
      <label>TAG MATCH</label>
      <div className="segmented-control">
        <button className={tagMode === "any" ? "is-active" : ""} type="button" onClick={() => setTagMode("any")}>Any</button>
        <button className={tagMode === "all" ? "is-active" : ""} type="button" onClick={() => setTagMode("all")}>All</button>
      </div>
      <div className="filter-tag-grid">
        {tags.length ? tags.map((tag) => (
          <button className={selectedTags.includes(tag) ? "is-active" : ""} type="button" key={tag} onClick={() => toggleTag(tag)}>#{tag}</button>
        )) : <p>利用可能なTagがありません。</p>}
      </div>
      <label>NON-MATCHING OBJECTS</label>
      <div className="segmented-control">
        <button className={behavior === "dim" ? "is-active" : ""} type="button" onClick={() => setBehavior("dim")}>Dim</button>
        <button className={behavior === "hide" ? "is-active" : ""} type="button" onClick={() => setBehavior("hide")}>Hide</button>
      </div>
      <button className="filter-clear" type="button" onClick={clear}>Clear filters</button>
    </section>
  );
}
