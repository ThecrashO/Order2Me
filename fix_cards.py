import re

with open('js/student.js', 'r', encoding='utf-8') as f:
    content = f.read()

new_func = (
    "function displayMenuItems(items) {\r\n"
    "    const container = document.getElementById('menu-container');\r\n"
    "    container.innerHTML = '';\r\n"
    "\r\n"
    "    if (!items || items.length === 0) {\r\n"
    "        container.innerHTML = \"<p class='text-muted'>No items in this category.</p>\";\r\n"
    "        return;\r\n"
    "    }\r\n"
    "\r\n"
    "    const CATEGORY_META = {\r\n"
    "        food:    { icon: '\U0001f37d\ufe0f', label: 'Food',    css: 'cat-food'    },\r\n"
    "        drink:   { icon: '\U0001f964',       label: 'Drink',   css: 'cat-drink'   },\r\n"
    "        salad:   { icon: '\U0001f957',       label: 'Salad',   css: 'cat-salad'   },\r\n"
    "        snack:   { icon: '\U0001f37f',       label: 'Snack',   css: 'cat-snack'   },\r\n"
    "        dessert: { icon: '\U0001f370',       label: 'Dessert', css: 'cat-dessert' },\r\n"
    "        other:   { icon: '\U0001f4e6',       label: 'Other',   css: 'cat-other'   }\r\n"
    "    };\r\n"
    "\r\n"
    "    items.forEach(food => {\r\n"
    "        const card = document.createElement('div');\r\n"
    "        card.className = 'col-6 col-md-4 mb-3 mb-md-4';\r\n"
    "\r\n"
    "        const catMeta = CATEGORY_META[food.category] || CATEGORY_META.other;\r\n"
    "\r\n"
    "        // Small floating pill overlaid on the image corner\r\n"
    "        const catPill = `<span class=\"menu-cat-pill ${catMeta.css}\"><span class=\"menu-cat-pill-icon\">${catMeta.icon}</span><span class=\"menu-cat-pill-label\">${catMeta.label}</span></span>`;\r\n"
    "\r\n"
    "        const imgWrap = food.image_url\r\n"
    "            ? `<div class=\"menu-img-wrap\"><img src=\"${food.image_url}\" alt=\"${escapeHtml(food.name)}\" class=\"menu-card-img\" onerror=\"this.style.display='none';this.nextElementSibling.style.display='flex';\"><div class=\"menu-card-img menu-img-placeholder\" style=\"display:none;\">\U0001f37d\ufe0f</div>${catPill}</div>`\r\n"
    "            : `<div class=\"menu-img-wrap\"><div class=\"menu-card-img menu-img-placeholder\">\U0001f37d\ufe0f</div>${catPill}</div>`;\r\n"
    "\r\n"
    "        card.innerHTML = `\r\n"
    "            <div class=\"card shadow-sm h-100 menu-card\">\r\n"
    "                ${imgWrap}\r\n"
    "                <div class=\"card-body d-flex flex-column menu-card-body\">\r\n"
    "                    <h6 class=\"card-title menu-card-title\">${escapeHtml(food.name)}</h6>\r\n"
    "                    <p class=\"card-text text-muted small flex-grow-1 menu-card-desc\">\r\n"
    "                        ${escapeHtml(food.description || 'Delicious item')}\r\n"
    "                    </p>\r\n"
    "                    <div class=\"fw-bold text-primary menu-card-price mb-2\">${food.price.toLocaleString()} MMK</div>\r\n"
    "                    <button\r\n"
    "                        class=\"btn btn-primary btn-sm w-100 menu-add-btn\"\r\n"
    "                        onclick=\"addToCart(${food.id}, '${escapeHtml(food.name)}', ${food.price})\"\r\n"
    "                    >\r\n"
    "                        + Add\r\n"
    "                    </button>\r\n"
    "                </div>\r\n"
    "            </div>\r\n"
    "        `;\r\n"
    "        container.appendChild(card);\r\n"
    "    });\r\n"
    "}"
)

pattern = r'function displayMenuItems\(items\) \{.*?\n\}'
result = re.sub(pattern, new_func, content, flags=re.DOTALL)

if result == content:
    print('ERROR: pattern not matched')
else:
    with open('js/student.js', 'w', encoding='utf-8') as f:
        f.write(result)
    print('OK')
