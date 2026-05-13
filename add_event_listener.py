import re

with open('js/pages/recipes.js', 'r') as f:
    content = f.read()

# In export async function renderRecipes(container, currentPath), we want to add an event listener
# and return a cleanup function that removes the listener.

# Currently it looks like:
#     // Check if deep linked (e.g., /recipes/water)
#     const pathParts = currentPath.split('/');
#     if (pathParts.length > 2 && pathParts[2]) {
#         const id = pathParts[2];
#         const item = allItems[id];
#         if (item) {
#             showDetailModal(item);
#         }
#     }
# }
# We want to add the routeupdate listener here and return the cleanup function.

new_code = """    // Check if deep linked (e.g., /recipes/water)
    const handlePath = (path) => {
        const pathParts = path.split('/');
        if (pathParts.length > 2 && pathParts[2]) {
            const id = pathParts[2];
            const item = allItems[id];
            if (item) {
                showDetailModal(item);
            } else {
                closeModal();
            }
        } else {
            closeModal();
        }
    };

    handlePath(currentPath);

    const onRouteUpdate = (e) => {
        if (e.detail.path.startsWith('/recipes')) {
            handlePath(e.detail.path);
        }
    };

    window.addEventListener('routeupdate', onRouteUpdate);

    return () => {
        window.removeEventListener('routeupdate', onRouteUpdate);
    };
}"""

content = re.sub(r"    // Check if deep linked \(e\.g\., /recipes/water\)\n    const pathParts = currentPath\.split\('/'\);\n    if \(pathParts\.length > 2 && pathParts\[2\]\) \{\n        const id = pathParts\[2\];\n        const item = allItems\[id\];\n        if \(item\) \{\n            showDetailModal\(item\);\n        \}\n    \}\n\}", new_code, content)

with open('js/pages/recipes.js', 'w') as f:
    f.write(content)
