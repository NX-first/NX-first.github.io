(() => {
  function findDoi(record) {
    const identifiers = record["external-ids"]?.["external-id"] ?? [];
    return identifiers.find((id) => id["external-id-type"] === "doi" &&
      id["external-id-relationship"] === "self" &&
      /^10\.\d{4,9}\/\S+$/i.test(id["external-id-value"]))?.["external-id-value"];
  }

  function publications(groups, profileUrl) {
    const works = new Map();
    for (const group of groups) {
      const summaries = group["work-summary"].filter((work) =>
        work.visibility === "public" && work.type === "journal-article");
      summaries.sort((a, b) => Number(b["display-index"]) - Number(a["display-index"]));
      const work = summaries.find((summary) => summary.title?.title?.value?.trim());
      if (!work) continue;

      const title = work.title.title.value.trim();
      const journal = work["journal-title"]?.value?.trim();
      const date = work["publication-date"];
      const year = date?.year?.value;
      const sortDate = year ? Number(year) * 10000 +
        Number(date.month?.value ?? 0) * 100 + Number(date.day?.value ?? 0) : 0;
      const doi = findDoi(work) || findDoi(group);
      const key = doi ? doi.toLowerCase() : String(work["put-code"]);
      const link = doi ? `https://doi.org/${doi.split("/").map(encodeURIComponent).join("/")}`
        : profileUrl;

      if (!works.has(key)) works.set(key, { key, title, journal, year, sortDate, link });
    }

    return [...works.values()].sort((a, b) => b.sortDate - a.sortDate ||
      a.title.localeCompare(b.title));
  }

  async function sync(container) {
    const id = container.dataset.orcidId;
    const profileUrl = `https://orcid.org/${id}`;
    const response = await fetch(`https://pub.orcid.org/v3.0/${id}/works`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return;

    const record = await response.json();
    if (!Array.isArray(record.group)) return;

    const works = publications(record.group, profileUrl);
    const list = container.querySelector("[data-orcid-works]");
    const template = container.querySelector("[data-orcid-work]");
    const existing = new Map([...list.children].map((item) => [item.dataset.workKey, item]));
    list.replaceChildren(...works.map((work) => {
      const item = existing.get(work.key)?.cloneNode(true) ??
        template.content.firstElementChild.cloneNode(true);
      item.dataset.workKey = work.key;

      const title = item.querySelector("[data-work-title]");
      title.textContent = work.title;
      title.href = work.link;

      const citation = item.querySelector("[data-work-citation]");
      citation.replaceChildren();
      if (work.journal) {
        const journal = document.createElement("em");
        journal.textContent = work.journal;
        citation.append(" · ", journal);
      }
      if (work.year) citation.append(` (${work.year})`);
      return item;
    }));
    container.querySelector("[data-orcid-empty]").hidden = works.length !== 0;
  }

  for (const container of document.querySelectorAll("[data-orcid-id]")) {
    // The page already contains the last verified list if ORCID is unreachable.
    sync(container).catch(() => {});
  }
})();
