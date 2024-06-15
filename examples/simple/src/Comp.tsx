import { graphql } from "relay-runtime";
import { Show } from "solid-js";
import { createFragment, createLazyLoadQuery } from "solid-relay";
import type { CompQuery } from "./__generated__/CompQuery.graphql";
import type { Comp_Sub_user$key } from "./__generated__/Comp_Sub_user.graphql";

export default () => {
	const [data] = createLazyLoadQuery<CompQuery>(
		graphql`
      query CompQuery {
        viewer {
          login
          ... on User {
            ...Comp_Sub_user
          }
        }
      }
    `,
		{},
	);

	return (
		<div>
			<Show when={data()} fallback={"meh"}>
				{(data) => (
					<div>
						<p>{data().viewer.login}</p>
						<Sub $user={data().viewer} />
					</div>
				)}
			</Show>
		</div>
	);
};

interface SubProps {
	$user: Comp_Sub_user$key;
}

const Sub = (props: SubProps) => {
	const [viewer] = createFragment(
		graphql`
      fragment Comp_Sub_user on User {
        login
        email
      }
    `,
		props.$user,
	);

	return (
		<div>
			<Show when={viewer()} fallback={"eh"}>
				{(viewer) => <p>{`${viewer().login} ${viewer().email}`}</p>}
			</Show>
		</div>
	);
};
