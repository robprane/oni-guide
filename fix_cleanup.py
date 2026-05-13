import re

with open('js/pages/recipes.js', 'r') as f:
    content = f.read()

# We need to add document.getElementById('detail-dialog')?.close(); to the cleanup function
old_cleanup = """    return () => {
        window.removeEventListener('routeupdate', onRouteUpdate);
    };"""

new_cleanup = """    return () => {
        window.removeEventListener('routeupdate', onRouteUpdate);
        const dialog = document.getElementById('detail-dialog');
        if (dialog && dialog.open) {
            dialog.close();
        }
    };"""

content = content.replace(old_cleanup, new_cleanup)

with open('js/pages/recipes.js', 'w') as f:
    f.write(content)
