import Form from './_components/search.tsx'


export const title = "Welcome to my page";
export const layout = "base.tsx";




export default ({comp, title}) => {
    return (
        <>
            <comp.search/>
            <h1 class={'h-full'}>{title}</h1>
            <p>This is my first post using lume. I hope you like it!</p>
        </>
    );
};