import Form from './_components/search.tsx'


export const title = "Welcome to my page";
export const layout = "base.tsx";


export const css = `
h1 {
    color: blue;
}
`


export default ({comp, title}) => {
    return (
        <>
            <comp.search/>
            <h1 class={''}>{title}</h1>
            <p>This is my first post using lume. I hope you like it!</p>
        </>
    );
};