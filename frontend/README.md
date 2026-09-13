# Frontend

when the app starts, make an http request to this url:
https://script.google.com/macros/s/AKfycbx--XolEkGPA49hu8Ng0jheGkeYyJ9IO4YZ3Ji7Z8lZtzZ0cYW-8ku27_U9fGowpB-BGg/exec

create a file called constants.ts to store that value. here is an example of the output (json):
[
{
"id": 1,
"name": "Emotional damage",
"url": "https://www.youtube.com/watch?v=iTYrRc-Xsk4"
},
{
"id": 2,
"name": "Coffin dance",
"url": "https://www.youtube.com/watch?v=71A2Oh_Zc78"
},
{
"id": 3,
"name": "Just do it",
"url": "https://www.youtube.com/watch?v=ZXsQAXx_ao0"
}
]

it's always an array.

while the app is loading the content, show a page saying "Loading..." and a spinner or something. when it's done, then show the main screen with the "START" button

store the result in a variable. that content is the meme catagogue.
