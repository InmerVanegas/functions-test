// @ts-nocheck
import { useEffect, useCallback, useState, useMemo } from "react";
import { json } from "@remix-run/node";
import { useForm, useField } from "@shopify/react-form";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from "@shopify/app-bridge/actions";
import { CurrencyCode } from "@shopify/react-i18n";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  ActiveDatesCard,
  CombinationCard,
  DiscountClass,
  DiscountMethod,
  MethodCard,
  DiscountStatus,
  RequirementType,
  SummaryCard,
  UsageLimitsCard,
  onBreadcrumbAction,
} from "@shopify/discount-app-components";
import {
  Banner,
  Card,
  Text,
  Layout,
  Page,
  PageActions,
  TextField,
  VerticalStack,
  Listbox,
  Combobox,
  Tag,
  EmptySearchResult,
  HorizontalStack,
  AutoSelection,
  ChoiceList,
} from "@shopify/polaris";

import shopify from "../shopify.server";
import { NotFoundPage } from "../components/NotFoundPage";
/* import { ChoiceList } from "public/build/_shared/chunk-KWP2E7CA"; */

// This is a server-side action that is invoked when the form is submitted.
// It makes an admin GraphQL request to update a discount.
export const action = async ({ params, request }) => {
  const { id, functionId } = params;
  const { admin } = await shopify.authenticate.admin(request);
  const formData = await request.formData();
  const {
    title,
    method,
    code,
    combinesWith,
    usageLimit,
    appliesOncePerCustomer,
    startsAt,
    endsAt,
    configuration,
  } = JSON.parse(formData.get("discount"));

  const baseDiscount = {
    functionId,
    title,
    combinesWith,
    startsAt: new Date(startsAt),
    endsAt: endsAt && new Date(endsAt),
  };

  if (method === DiscountMethod.Code) {
    const baseCodeDiscount = {
      ...baseDiscount,
      title: code,
      code,
      usageLimit,
      appliesOncePerCustomer,
    };

    const response = await admin.graphql(
      `#graphql
          mutation UpdateCodeDiscount($id: ID!, $discount: DiscountCodeAppInput!) {
            discountUpdate: discountCodeAppUpdate(id: $id, codeAppDiscount: $discount) {
              userErrors {
                code
                message
                field
              }
            }
          }`,
      {
        variables: {
          id: `gid://shopify/DiscountCodeApp/${id}`,
          discount: {
            ...baseCodeDiscount,
            metafields: [
              {
                id: configuration.metafieldId,
                value: JSON.stringify({
                  /* quantity: configuration.quantity, */
                  percentage: configuration.percentage,
                  discountTags: configuration.discountTags,
                  discardedTags: configuration.discardedTags,
                  sessionStatus: configuration.sessionStatus,
                }),
              },
            ],
          },
        },
      }
    );

    const responseJson = await response.json();
    const errors = responseJson.data.discountUpdate?.userErrors;
    return json({ errors });
  } else {
    const response = await admin.graphql(
      `#graphql
          mutation UpdateAutomaticDiscount($id: ID!, $discount: DiscountAutomaticAppInput!) {
            discountUpdate: discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $discount) {
              userErrors {
                code
                message
                field
              }
            }
          }`,
      {
        variables: {
          id: `gid://shopify/DiscountAutomaticApp/${id}`,
          discount: {
            ...baseDiscount,
            metafields: [
              {
                id: configuration.metafieldId,
                value: JSON.stringify({
                  /* quantity: configuration.quantity, */
                  percentage: configuration.percentage,
                  discountTags: configuration.discountTags,
                  discardedTags: configuration.discardedTags,
                  sessionStatus: configuration.sessionStatus,
                }),
              },
            ],
          },
        },
      }
    );

    const responseJson = await response.json();
    const errors = responseJson.data.discountUpdate?.userErrors;
    return json({ errors });
  }
};

// This is invoked on the server to load the discount data with an admin GraphQL request. The result
// is used by the component below to render the form.
export const loader = async ({ params, request }) => {
  const { id } = params;
  const { admin } = await shopify.authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query GetDiscount($id: ID!) {
        discountNode(id: $id) {
          id
          configurationField: metafield(
            namespace: "$app:volume-discount"
            key: "function-configuration"
          ) {
            id
            value
          }
          discount {
            __typename
            ... on DiscountAutomaticApp {
              title
              discountClass
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
              startsAt
              endsAt
            }
            ... on DiscountCodeApp {
              title
              discountClass
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
              startsAt
              endsAt
              usageLimit
              appliesOncePerCustomer
              codes(first: 1) {
                nodes {
                  code
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        id: `gid://shopify/DiscountNode/${id}`,
      },
    }
  );

  const responseJson = await response.json();

  if (
    !responseJson.data.discountNode ||
    !responseJson.data.discountNode.discount
  ) {
    return json({ discount: null });
  }

  const method =
    responseJson.data.discountNode.discount.__typename === "DiscountCodeApp"
      ? DiscountMethod.Code
      : DiscountMethod.Automatic;
  const {
    title,
    codes,
    combinesWith,
    usageLimit,
    appliesOncePerCustomer,
    startsAt,
    endsAt,
  } = responseJson.data.discountNode.discount;
  const configuration = JSON.parse(
    responseJson.data.discountNode.configurationField.value
  );

  const discount = {
    title,
    method,
    code: codes?.nodes[0]?.code ?? "",
    combinesWith,
    usageLimit: usageLimit ?? null,
    appliesOncePerCustomer: appliesOncePerCustomer ?? false,
    startsAt,
    endsAt,
    configuration: {
      ...configuration,
      metafieldId: responseJson.data.discountNode.configurationField.id,
    },
  };

  return json({ discount });
};

// This is the React component for the page.
export default function VolumeEdit() {
  const submitForm = useSubmit();
  const actionData = useActionData();
  const { discount } = useLoaderData();
  const navigation = useNavigation();
  const app = useAppBridge();

  const isLoading = navigation.state === "submitting";
  const currencyCode = CurrencyCode.Cad;
  const submitErrors = actionData?.errors || [];
  const redirect = Redirect.create(app);

  useEffect(() => {
    if (actionData?.errors.length === 0) {
      redirect.dispatch(Redirect.Action.ADMIN_SECTION, {
        name: Redirect.ResourceType.Discount,
      });
    }
  }, [actionData]);

  if (!discount) {
    return <NotFoundPage />;
  }

  //Esto es para la combobox
  const [selectedTags, setSelectedTags] = useState([]);
  useEffect(() => {
    if (!isLoading && discount?.configuration?.discardedTags) {
      setSelectedTags(discount.configuration.discardedTags);
    }
  }, [isLoading, discount]);

  const [selectedTags2, setSelectedTags2] = useState([]);
  useEffect(() => {
    if (!isLoading && discount?.configuration?.discountTags) {
      setSelectedTags2(discount.configuration.discountTags);
    }
  }, [isLoading, discount]);

  //Para la choice list
  const [status, setStatus] = useState([discount?.configuration?.sessionStatus.value ?? 'No Authenticated'])

  const { metafieldId } = discount.configuration;
  const {
    fields: {
      discountTitle,
      discountCode,
      discountMethod,
      combinesWith,
      requirementType,
      requirementSubtotal,
      requirementQuantity,
      usageLimit,
      appliesOncePerCustomer,
      startDate,
      endDate,
      configuration,
    },
    submit,
  } = useForm({
    fields: {
      discountTitle: useField(discount.title),
      discountMethod: useField(discount.method),
      discountCode: useField(discount.code),
      combinesWith: useField(discount.combinesWith),
      requirementType: useField(RequirementType.None),
      requirementSubtotal: useField("0"),
      requirementQuantity: useField("0"),
      usageLimit: useField(discount.usageLimit),
      appliesOncePerCustomer: useField(discount.appliesOncePerCustomer),
      startDate: useField(discount.startsAt),
      endDate: useField(discount.endsAt),
      configuration: {
        /* quantity: useField(discount.configuration.quantity), */
        percentage: useField(discount.configuration.percentage),
        discountTags: useField(discount.configuration.discountTags),
        discardedTags: useField(discount.configuration.discardedTags),
        sessionStatus: useField(discount.configuration.sessionStatus),
      },
    },
    onSubmit: async (form) => {
      const discount = {
        title: form.discountTitle,
        method: form.discountMethod,
        code: form.discountCode,
        combinesWith: form.combinesWith,
        usageLimit: form.usageLimit == null ? null : parseInt(form.usageLimit),
        appliesOncePerCustomer: form.appliesOncePerCustomer,
        startsAt: form.startDate,
        endsAt: form.endDate,
        configuration: {
          metafieldId,
          /* quantity: parseInt(form.configuration.quantity), */
          percentage: parseFloat(form.configuration.percentage),
          discountTags: form.configuration.discountTags,
          discardedTags: form.configuration.discardedTags,
          sessionStatus: form.configuration.sessionStatus,
        },
      };

      submitForm({ discount: JSON.stringify(discount) }, { method: "post" });

      return { status: "success" };
    },
  });

  const errorBanner =
    submitErrors.length > 0 ? (
      <Layout.Section>
        <Banner status="critical">
          <p>There were some issues with your form submission:</p>
          <ul>
            {submitErrors.map(({ message, field }, index) => {
              return (
                <li key={`${message}${index}`}>
                  {field.join(".")} {message}
                </li>
              );
            })}
          </ul>
        </Banner>
      </Layout.Section>
    ) : null;



  const [value, setValue] = useState('');
  const [suggestion, setSuggestion] = useState('');

  const handleActiveOptionChange = useCallback(
    (activeOption) => {
      const activeOptionIsAction = activeOption === value;

      if (!activeOptionIsAction && !selectedTags.includes(activeOption)) {
        setSuggestion(activeOption);
      } else {
        setSuggestion('');
      }
    },
    [value, selectedTags],
  );

  const updateSelection = useCallback(
    (selected) => {
      const nextSelectedTags = new Set([...selectedTags]);

      if (nextSelectedTags.has(selected)) {
        nextSelectedTags.delete(selected);
      } else {
        nextSelectedTags.add(selected);
      }
      setSelectedTags([...nextSelectedTags]);
      setValue('');
      setSuggestion('');
    },
    [selectedTags],
  );

  const removeTag = useCallback(
    (tag) => () => {
      updateSelection(tag);
    },
    [updateSelection],
  );

  const getAllTags = useCallback(() => {
    const savedTags = ['Rustic', 'Antique', 'Vinyl', 'Vintage', 'Refurbished'];
    return [...new Set([...savedTags, ...selectedTags].sort())];
  }, [selectedTags]);

  const formatOptionText = useCallback(
    (option) => {
      const trimValue = value.trim().toLocaleLowerCase();
      const matchIndex = option.toLocaleLowerCase().indexOf(trimValue);

      if (!value || matchIndex === -1) return option;

      const start = option.slice(0, matchIndex);
      const highlight = option.slice(matchIndex, matchIndex + trimValue.length);
      const end = option.slice(matchIndex + trimValue.length, option.length);

      return (
        <p>
          {start}
          <Text fontWeight="bold" as="span">
            {highlight}
          </Text>
          {end}
        </p>
      );
    },
    [value],
  );

  const options = useMemo(() => {
    let list;
    const allTags = getAllTags();
    const filterRegex = new RegExp(value, 'i');

    if (value) {
      list = allTags.filter((tag) => tag.match(filterRegex));
    } else {
      list = allTags;
    }

    return [...list];
  }, [value, getAllTags]);

  let tags = [];

  const verticalContentMarkup =
    selectedTags.length > 0 ? (
      <HorizontalStack gap="5">
        {selectedTags.map((tag) => (
          <Tag key={`option-${tag}`} onRemove={removeTag(tag)} {...tags.push(tag)} {...configuration.discardedTags.value = tags}>
            {tag}
          </Tag>
        ))}
      </HorizontalStack>
    ) : null;

  const optionMarkup =
    options.length > 0
      ? options.map((option) => {
        return (
          <Listbox.Option
            key={option}
            value={option}
            selected={selectedTags.includes(option)}
            accessibilityLabel={option}
          >
            <Listbox.TextOption selected={selectedTags.includes(option)}>
              {formatOptionText(option)}
            </Listbox.TextOption>
          </Listbox.Option>
        );
      })
      : null;

  const noResults = value && !getAllTags().includes(value);

  const actionMarkup = noResults ? (
    <Listbox.Action value={value}>{`Add "${value}"`}</Listbox.Action>
  ) : null;

  const emptyStateMarkup = optionMarkup ? null : (
    <EmptySearchResult
      title=""
      description={`No tags found matching "${value}"`}
    />
  );

  const listboxMarkup =
    optionMarkup || actionMarkup || emptyStateMarkup ? (
      <Listbox
        autoSelection={AutoSelection.None}
        onSelect={updateSelection}
        onActiveOptionChange={handleActiveOptionChange}
      >
        {actionMarkup}
        {optionMarkup}
      </Listbox>
    ) : null;

  const [value2, setValue2] = useState('');
  const [suggestion2, setSuggestion2] = useState('');

  const handleActiveOptionChange2 = useCallback(
    (activeOption) => {
      const activeOptionIsAction = activeOption === value2;

      if (!activeOptionIsAction && !selectedTags2.includes(activeOption)) {
        setSuggestion2(activeOption);
      } else {
        setSuggestion2('');
      }
    },
    [value2, setSelectedTags2]
  );

  //Esto fue copiado y pegado
  const updateSelection2 = useCallback(
    (selected) => {
      const nextSelectedTags = new Set([...selectedTags2]);

      if (nextSelectedTags.has(selected)) {
        nextSelectedTags.delete(selected);
      } else {
        nextSelectedTags.add(selected);
      }
      setSelectedTags2([...nextSelectedTags]);
      setValue2('');
      setSuggestion2('');
    },
    [selectedTags2],
  );

  const removeTag2 = useCallback(
    (tag) => () => {
      updateSelection2(tag);
    },
    [updateSelection2],
  );

  const getAllTags2 = useCallback(() => {
    const savedTags = ['newsletter', 'JESSIE20', 'babywash10', 'Brand Rep', 'Chan'];
    return [...new Set([...savedTags, ...selectedTags2].sort())];
  }, [selectedTags2]);

  const formatOptionText2 = useCallback(
    (option) => {
      const trimValue = value2.trim().toLocaleLowerCase();
      const matchIndex = option.toLocaleLowerCase().indexOf(trimValue);

      if (!value2 || matchIndex === -1) return option;

      const start = option.slice(0, matchIndex);
      const highlight = option.slice(matchIndex, matchIndex + trimValue.length);
      const end = option.slice(matchIndex + trimValue.length, option.length);

      return (
        <p>
          {start}
          <Text fontWeight="bold" as="span">
            {highlight}
          </Text>
          {end}
        </p>
      );
    },
    [value2],
  );

  let tags2 = [];
  const options2 = useMemo(() => {
    let list;
    const allTags = getAllTags2();
    const filterRegex = new RegExp(value2, 'i');

    if (value2) {
      list = allTags.filter((tag) => tag.match(filterRegex));
    } else {
      list = allTags;
    }

    return [...list];
  }, [value2, getAllTags2]);

  const verticalContentMarkup2 =
    selectedTags2.length > 0 ? (
      <HorizontalStack gap="5">
        {selectedTags2.map((tag) => (
          <Tag key={`option-${tag}`} onRemove={removeTag2(tag)} {...tags2.push(tag)} {...configuration.discountTags.value = tags2}>
            {tag}
          </Tag>
        ))}
      </HorizontalStack>
    ) : null;

  const optionMarkup2 =
    options2.length > 0
      ? options2.map((option) => {
        return (
          <Listbox.Option
            key={option}
            value={option}
            selected={selectedTags2.includes(option)}
            accessibilityLabel={option}
          >
            <Listbox.TextOption selected={selectedTags2.includes(option)}>
              {formatOptionText2(option)}
            </Listbox.TextOption>
          </Listbox.Option>
        );
      })
      : null;

  const noResults2 = value2 && !getAllTags2().includes(value2);

  const actionMarkup2 = noResults2 ? (
    <Listbox.Action value={value2}>{`Add "${value2}"`}</Listbox.Action>
  ) : null;

  const emptyStateMarkup2 = optionMarkup2 ? null : (
    <EmptySearchResult
      title=""
      description={`No tags found matching "${value2}"`}
    />
  );

  const listboxMarkup2 =
    optionMarkup2 || actionMarkup2 || emptyStateMarkup2 ? (
      <Listbox
        autoSelection="FIRST"
        onSelect={updateSelection2}
        onActiveOptionChange={handleActiveOptionChange2}
      >
        {actionMarkup2}
        {optionMarkup2}
      </Listbox>
    ) : null;

  return (
    // Render a discount form using Polaris components and the discount app components
    <Page
      title="Edit your Discount"
      backAction={{
        content: "Discounts",
        onAction: () => onBreadcrumbAction(redirect, true),
      }}
      primaryAction={{
        content: "Save",
        onAction: submit,
        loading: isLoading,
      }}
    >
      <Layout>
        {errorBanner}
        <Layout.Section>
          <Form method="post">
            <VerticalStack align="space-around" gap="2">
              <MethodCard
                title="Volume"
                discountTitle={discountTitle}
                discountClass={DiscountClass.Product}
                discountCode={discountCode}
                discountMethod={discountMethod}
              />
              <Card>
                <VerticalStack gap="2">
                  <ChoiceList
                    title="Select Session Status"
                    choices={[
                      { label: 'No Authenticated', value: 'No Authenticated' },
                      { label: 'Authenticated', value: 'Authenticated' },
                    ]}
                    selected={status}
                    onChange={setStatus}
                  />
                </VerticalStack>
              </Card>
              <Card>
                <VerticalStack gap="2">
                  <Text variant="headingMd" as="h2">
                    Select the tags to discard
                  </Text>
                  <Combobox
                    allowMultiple
                    activator={
                      <Combobox.TextField
                        autoComplete="off"
                        label="Search tags"
                        labelHidden
                        value={value}
                        suggestion={suggestion}
                        placeholder="Search tags"
                        onChange={setValue}
                      />
                    }
                  >
                    {listboxMarkup}
                  </Combobox>
                  <div style={{ margin: '5px 0' }} />
                  <Banner
                    title="Products with the following tags do not apply to the discount"
                    status="info"
                  >
                  </Banner>
                  <div style={{ margin: '5px 0' }} />
                  <HorizontalStack gap={5}>
                    {verticalContentMarkup}
                  </HorizontalStack>
                </VerticalStack>
              </Card>
              <Card>
                <VerticalStack gap="2">
                  <Text variant="headingMd" as="h2">
                    Select the tags to discard
                  </Text>
                  <Combobox
                    allowMultiple
                    activator={
                      <Combobox.TextField
                        autoComplete="off"
                        label="Search tags"
                        labelHidden
                        value={value2}
                        suggestion={suggestion2}
                        placeholder="Search tags"
                        onChange={setValue2}
                      />
                    }
                  >
                    {listboxMarkup2}
                  </Combobox>
                  <div style={{ margin: '5px 0' }} />
                  <Banner
                    title="Products with the following tags do not apply to the discount"
                    status="info"
                  >
                  </Banner>
                  <div style={{ margin: '5px 0' }} />
                  <HorizontalStack gap={5}>
                    {verticalContentMarkup2}
                  </HorizontalStack>
                </VerticalStack>
              </Card>
              <Card>
                <VerticalStack gap="3">
                  <Text variant="headingMd" as="h2">
                    Enter discount value
                  </Text>
                  <TextField
                    label="Discount percentage"
                    autoComplete="on"
                    {...configuration.percentage}
                    suffix="%"
                  />

                </VerticalStack>
              </Card>
              {discountMethod.value === DiscountMethod.Code && (
                <UsageLimitsCard
                  totalUsageLimit={usageLimit}
                  oncePerCustomer={appliesOncePerCustomer}
                />
              )}
              <CombinationCard
                combinableDiscountTypes={combinesWith}
                discountClass={DiscountClass.Product}
                discountDescriptor={"Discount"}
              />
              <ActiveDatesCard
                startDate={startDate}
                endDate={endDate}
                timezoneAbbreviation="EST"
              />
            </VerticalStack>
          </Form>
        </Layout.Section>
        <Layout.Section secondary>
          <SummaryCard
            header={{
              discountMethod: discountMethod.value,
              discountDescriptor:
                discountMethod.value === DiscountMethod.Automatic
                  ? discountTitle.value
                  : discountCode.value,
              appDiscountType: "Volume",
              isEditing: false,
            }}
            performance={{
              status: DiscountStatus.Scheduled,
              usageCount: 0,
              isEditing: false,
            }}
            minimumRequirements={{
              requirementType: requirementType.value,
              subtotal: requirementSubtotal.value,
              quantity: requirementQuantity.value,
              currencyCode: currencyCode,
            }}
            usageLimits={{
              oncePerCustomer: appliesOncePerCustomer.value,
              totalUsageLimit: usageLimit.value,
            }}
            activeDates={{
              startDate: startDate.value,
              endDate: endDate.value,
            }}
          />
        </Layout.Section>
        <Layout.Section>
          <PageActions
            primaryAction={{
              content: "Save discount",
              onAction: submit,
              loading: isLoading,
            }}
            secondaryActions={[
              {
                content: "Discard",
                onAction: () => onBreadcrumbAction(redirect, true),
              },
            ]}
          />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
