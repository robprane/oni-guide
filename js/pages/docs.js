export function renderDocs(container) {
    container.innerHTML = `
        <div class="container" style="max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem;">
            <h2>Documentation & Contributing</h2>

            <section style="background: var(--card-bg); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-color);">
                <h3>Adding New Recipes</h3>
                <p>The recipes and materials data are entirely driven by JSON files located in the <code>/data/</code> directory.</p>

                <h4>Materials (<code>/data/materials.json</code>)</h4>
                <p>To add a new material, append a new JSON object to the array:</p>
                <pre style="background: var(--bg-color); padding: 1rem; border-radius: 4px; overflow-x: auto;">
{
  "id": "magma",
  "name": "Magma",
  "type": "Liquid",
  "freezing_point": 1409.85,
  "freezing_product": "igneous_rock",
  "description": "Superheated liquid rock."
}
                </pre>

                <h4 style="margin-top: 1rem;">Buildings (<code>/data/buildings.json</code>)</h4>
                <p>To add a new building recipe:</p>
                <pre style="background: var(--bg-color); padding: 1rem; border-radius: 4px; overflow-x: auto;">
{
  "id": "rock_crusher",
  "name": "Rock Crusher",
  "category": "Refinement",
  "inputs": [
    { "material": "copper_ore", "amount": 100, "unit": "kg" }
  ],
  "outputs": [
    { "material": "copper", "amount": 50, "unit": "kg" },
    { "material": "sand", "amount": 50, "unit": "kg" }
  ],
  "power_consumption": 240,
  "description": "Crushes raw minerals into refined metals and sand."
}
                </pre>
            </section>

            <section style="background: var(--card-bg); padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-color);">
                <h3>Modifying Canvas Rules</h3>
                <p>The interactive canvas is built entirely in Vanilla JS for maximum performance. You can modify its behavior by editing the files in <code>/js/canvas/</code>.</p>

                <ul style="margin-left: 1.5rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem;">
                    <li><strong><code>config.json</code></strong>: Change visual properties like cell size, sweeper radius, and colors without touching code.</li>
                    <li><strong><code>los.js</code></strong>: Modify the <code>calculateSweeperCoverage</code> function if you want to alter the strict ONI line-of-sight and corner-cutting diamond shapes.</li>
                    <li><strong><code>simulation.js</code></strong>: Adjust the pipe network tick rate, flow priority, and bridge logic. Liquids currently prioritize flowing rightward into empty pipes or teleporting across bridges.</li>
                </ul>
            </section>
        </div>
    `;
}