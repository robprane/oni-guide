export function renderHome(container) {
    container.innerHTML = `
        <div class="container">
            <h1>Welcome to ONI.guide</h1>
            <p>Your interactive companion for Oxygen Not Included.</p>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; margin-top: 2rem;">

                <div style="background: var(--card-bg); padding: 2rem; border-radius: 8px; border: 1px solid var(--border-color);">
                    <h2>Recipes Database</h2>
                    <p>Browse building requirements, material transitions, and production chains.</p>
                    <a href="#/recipes" class="nav-link" data-route="/recipes" style="display: inline-block; margin-top: 1rem; background: var(--primary-color); color: white;">View Recipes</a>
                </div>

                <div style="background: var(--card-bg); padding: 2rem; border-radius: 8px; border: 1px solid var(--border-color);">
                    <h2>Interactive Canvas</h2>
                    <p>Plan your Auto-Sweeper layouts with our interactive simulator.</p>
                    <a href="#/canvas" class="nav-link" data-route="/canvas" style="display: inline-block; margin-top: 1rem; background: var(--primary-color); color: white;">Open Canvas</a>
                </div>
            </div>
        </div>
    `;
}