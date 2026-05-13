with open('js/pages/recipes.js', 'r') as f:
    content = f.read()

if 'function showDetailModal(item) {' in content:
    print("Found showDetailModal")
else:
    print("NOT FOUND showDetailModal")

if '<dialog>' in content:
    print("Found <dialog>")
else:
    print("NOT FOUND <dialog>")
