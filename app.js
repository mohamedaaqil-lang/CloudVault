import {
    initializeApp
}
from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";


import {

    getAuth,

    createUserWithEmailAndPassword,

    signInWithEmailAndPassword,

    signOut,

    onAuthStateChanged

}
from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";



const firebaseConfig = {

    apiKey: "YOUR_API_KEY",

    authDomain: "YOUR_PROJECT.firebaseapp.com",

    projectId: "YOUR_PROJECT_ID",

    storageBucket: "YOUR_PROJECT_ID.appspot.com",

    messagingSenderId: "YOUR_MESSAGING_ID",

    appId: "YOUR_APP_ID"

};



const app =
initializeApp(firebaseConfig);


const auth =
getAuth(app);



/* ---------------------------
REGISTER USER
---------------------------- */

window.registerUser =
function () {


    const email =
    document.getElementById("email").value;


    const password =
    document.getElementById("password").value;



    createUserWithEmailAndPassword(

        auth,

        email,

        password

    )

    .then(() => {

        alert(
            "Account Created Successfully"
        );


        window.location.href =
        "dashboard.html";

    })


    .catch(error => {

        alert(
            error.message
        );

    });

};



/* ---------------------------
LOGIN
---------------------------- */

window.login =
function () {


    const email =
    document.getElementById("email").value;


    const password =
    document.getElementById("password").value;



    signInWithEmailAndPassword(

        auth,

        email,

        password

    )

    .then(() => {


        window.location.href =
        "dashboard.html";

    })


    .catch(error => {

        alert(
            error.message
        );

    });

};



/* ---------------------------
LOGOUT
---------------------------- */

window.logout =
function () {


    signOut(auth)


    .then(() => {


        window.location.href =
        "index.html";


    });

};



/* ---------------------------
UPLOAD FILE
---------------------------- */

window.uploadFile =
async function () {


    const fileInput =
    document.getElementById(
        "fileInput"
    );


    const category =
    document.getElementById(
        "category"
    ).value;



    const file =
    fileInput.files[0];



    if (!file) {


        alert(
            "Please select a file"
        );


        return;

    }



    const user =
    auth.currentUser;



    const formData =
    new FormData();



    formData.append(
        "file",
        file
    );


    formData.append(
        "uid",
        user.uid
    );


    formData.append(
        "category",
        category
    );



    try {


        const response =
        await fetch(

            "http://127.0.0.1:5000/api/upload",

            {

                method: "POST",

                body: formData

            }

        );



        const data =
        await response.json();



        alert(
            data.message
        );



        loadFiles();


    }


    catch (error) {


        alert(
            error.message
        );

    }

};




/* ---------------------------
LOAD FILES
---------------------------- */

async function loadFiles() {


    const user =
    auth.currentUser;



    if (!user) {


        return;

    }



    const response =
    await fetch(

        `http://127.0.0.1:5000/api/files/${user.uid}`

    );



    const data =
    await response.json();



    const fileList =
    document.getElementById(
        "fileList"
    );



    if (!fileList) {


        return;

    }



    fileList.innerHTML =
    "";



    data.files.forEach(file => {


        fileList.innerHTML += `

        <div class="file-card">

        <h3>
        ${file.filename}
        </h3>


        <p>

        Category:
        ${file.category}

        </p>


        <a

        href="${file.url}"

        target="_blank">

        Download

        </a>


        <button

        onclick="deleteFile('${file.id}')">

        Delete

        </button>


        </div>

        `;


    });

}




/* ---------------------------
DELETE FILE
---------------------------- */

window.deleteFile =
async function (id) {


    if (!

        confirm(
            "Are you sure?"
        )

    ) {


        return;

    }



    await fetch(

        `http://127.0.0.1:5000/api/delete/${id}`,

        {

            method: "DELETE"

        }

    );



    loadFiles();


};




/* ---------------------------
SEARCH FILE
---------------------------- */

window.searchFiles =
function () {


    const search =
    document
    .getElementById("search")
    .value
    .toLowerCase();



    const cards =
    document.querySelectorAll(
        ".file-card"
    );



    cards.forEach(card => {


        const text =
        card.innerText
        .toLowerCase();



        card.style.display =

        text.includes(search)

        ? "block"

        : "none";


    });

};




/* ---------------------------
AUTH CHECK
---------------------------- */

onAuthStateChanged(

    auth,

    user => {


        if (

            user &&

            window.location.pathname.includes(
                "dashboard"
            )

        ) {


            loadFiles();


        }


    }

);