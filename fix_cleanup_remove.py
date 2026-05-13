import re

with open('js/pages/recipes.js', 'r') as f:
    content = f.read()

# Wait, if we navigate to #/canvas, the dialog is closed but not removed from the DOM?
# The instructions mentioned: "Because the dialog is appended directly to document.body rather than the router's app-content container, navigating away from the Recipes page ... leaves the modal lingering permanently on the screen. The component's cleanup function removes the event listener but forgets to close/remove the dialog."
# Let's completely remove it from the DOM when tearing down the page to be safe.

old_cleanup = """    return () => {
        window.removeEventListener('routeupdate', onRouteUpdate);
        const dialog = document.getElementById('detail-dialog');
        if (dialog && dialog.open) {
            dialog.close();
        }
    };"""

new_cleanup = """    return () => {
        window.removeEventListener('routeupdate', onRouteUpdate);
        const dialog = document.getElementById('detail-dialog');
        if (dialog) {
            if (dialog.open) dialog.close();
            dialog.remove();
        }
    };"""

content = content.replace(old_cleanup, new_cleanup)

with open('js/pages/recipes.js', 'w') as f:
    f.write(content)
