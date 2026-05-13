with open('js/pages/recipes.js', 'r') as f:
    content = f.read()

if 'dialog.remove()' in content:
    print("Found dialog.remove()")
else:
    print("NOT FOUND dialog.remove()")
