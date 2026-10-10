export default {
    data: () => ({
        entries: [],
        search: '',
        currentPage: 1,
        pageSize: 20,
        loading: true,
        error: '',
    }),
    computed: {
        filteredEntries() {
            const query = this.search.trim().toLocaleLowerCase();
            if (!query) return this.entries;
            return this.entries.filter(entry =>
                (entry.level || '').toLocaleLowerCase().includes(query)
            );
        },
        pageCount() {
            return Math.max(1, Math.ceil(this.filteredEntries.length / this.pageSize));
        },
        paginatedEntries() {
            const start = (this.currentPage - 1) * this.pageSize;
            return this.filteredEntries.slice(start, start + this.pageSize);
        },
    },
    watch: {
        search() {
            this.currentPage = 1;
        },
        pageCount(nextPageCount) {
            if (this.currentPage > nextPageCount) this.currentPage = nextPageCount;
        },
    },
    async mounted() {
        try {
            const response = await fetch('/data/_changelog.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            this.entries = Array.isArray(data)
                ? data.slice().sort((a, b) =>
                    (b.date || '').localeCompare(a.date || '') ||
                    (b.id || 0) - (a.id || 0)
                )
                : [];
        } catch (error) {
            this.error = 'Could not load changelog history. Please try again later.';
            console.error('Failed to load changelog:', error);
        } finally {
            this.loading = false;
        }
    },
    methods: {
formatDate(date) {
    if (!date) return 'Unknown date';
    return date.split("-").reverse().join("-");
},
        description(entry) {
            const from = entry.fromRank;
            const to = entry.toRank;
            if (entry.action === 'Placed') {
                return `placed at #${to}${entry.toList ? ` on the ${entry.toList}` : ''}.`;
            }
            if (entry.action === 'Removed') {
                return `removed from #${from}${entry.fromList ? ` on the ${entry.fromList}` : ''}.`;
            }
            if (entry.action === 'Moved') {
                const oldList = entry.fromList ? ` on the ${entry.fromList}` : '';
                const newList = entry.toList ? ` on the ${entry.toList}` : '';
                if (entry.fromList !== entry.toList) {
                    return `moved from #${from}${oldList} to #${to}${newList}.`;
                }
                return `moved from #${from} to #${to}${newList}.`;
            }
            return entry.detail || 'List updated.';
        },
        badgeClass(action) {
            return {
                Placed: 'changelog-badge--placed',
                Moved: 'changelog-badge--moved',
                Removed: 'changelog-badge--removed',
            }[action] || '';
        },
        goToPage(page) {
            this.currentPage = Math.min(this.pageCount, Math.max(1, page));
        },
    },
    template: `
        <main class="page-changelog">
            <section class="changelog-panel">
                <div class="changelog-heading">
                    <h1>Changelog</h1>
                    <p>Placements, rank movements and removals from the list.</p>
                </div>

                <label class="changelog-search-label" for="changelog-search">Search level history</label>
                <input
                    id="changelog-search"
                    class="changelog-search"
                    type="search"
                    v-model="search"
                    placeholder="Search levels by name..."
                    autocomplete="off"
                />
                <p class="changelog-count">
                    {{ filteredEntries.length }} {{ filteredEntries.length === 1 ? 'change' : 'changes' }}
                    <template v-if="search"> for “{{ search }}”</template>
                </p>

                <div v-if="loading" class="changelog-message">Loading changelog…</div>
                <div v-else-if="error" class="changelog-message changelog-error">{{ error }}</div>
                <div v-else-if="filteredEntries.length === 0" class="changelog-message">
                    {{ search ? 'No changelog entries found for this level.' : 'No changes have been recorded yet. Future list updates will appear here.' }}
                </div>

                <ol v-else class="changelog-entries">
                    <li v-for="entry in paginatedEntries" :key="entry.id" class="changelog-entry">
                        <time class="changelog-date" :datetime="entry.date">{{ formatDate(entry.date) }}</time>
                        <div class="changelog-entry-line">
                            <span class="changelog-badge" :class="badgeClass(entry.action)">{{ entry.action }}</span>
                            <p><strong>{{ entry.level }}</strong> {{ description(entry) }}</p>
                        </div>
                    </li>
                </ol>

                <nav v-if="!loading && !error && pageCount > 1" class="changelog-pagination" aria-label="Changelog pages">
                    <button class="changelog-page-button" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">← Previous</button>
                    <button
                        v-for="page in pageCount"
                        :key="page"
                        class="changelog-page-button"
                        :class="{ 'is-active': currentPage === page }"
                        :aria-current="currentPage === page ? 'page' : null"
                        @click="goToPage(page)"
                    >{{ page }}</button>
                    <button class="changelog-page-button" :disabled="currentPage === pageCount" @click="goToPage(currentPage + 1)">Next →</button>
                </nav>
            </section>
        </main>
    `,
};
