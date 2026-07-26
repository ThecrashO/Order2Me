async function loadMenu() {

    const { data, error } = await supabaseClient
        .from("menu_items")
        .select("*")
        .eq("is_available", true);


    if (error) {
        console.error(error);
        return;
    }


    const container = document.getElementById("menu-container");


    data.forEach(food => {

        container.innerHTML += `

        <div class="col-md-4 mb-4">

            <div class="card shadow-sm">

                <div class="card-body">

                    <h5 class="card-title">
                        ${food.name}
                    </h5>

                    <p>
                        ${food.description ?? ""}
                    </p>

                    <h6>
                        ${food.price} MMK
                    </h6>

                    <button class="btn btn-primary">
                        Order
                    </button>

                </div>

            </div>

        </div>

        `;

    });

}


loadMenu(); // Load available menu items from Supabase