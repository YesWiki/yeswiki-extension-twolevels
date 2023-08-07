/*
 * This file is part of the YesWiki Extension twolevels.
 *
 * Authors : see README.md file that was distributed with this source code.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import twoLevelsHelper from '../twolevels.js'

if (Vue) {
    let isSubLevelCache = null
    const isSubLevel = (root) => {
        if (isSubLevelCache === null){
            if (Object.keys(root.formFields).length === 0){
                return false
            }
            isSubLevelCache = Object.values(root.formFields).some((field)=>('parentFieldName' in field && 'associatingFormId' in field))
        }
        return isSubLevelCache
    }

    const canShowAnd = (root) => {
        return (root.params.intrafiltersmode === 'and')
    }

    const filterEntriesSync = (entries,root) => {
        if (!canShowAnd(root)){
            return entries
        }
        let results = entries
        for(const filterId in root.computedFilters) {
            results = results.filter(entry => {
                if (!(filterId in entry) || typeof entry[filterId] != "string"){
                    return false
                }
                return root.computedFilters[filterId].every((value)=>entry[filterId].split(',').includes(value));
            })
        }
        return results
    }

    const getEntriesForThisField = (entries,fieldName,test) => {
        return entries.filter(entry => {
            let entryValues = entry[fieldName]
            if (!entryValues || typeof entryValues != "string"){
                return
            }
            entryValues = entryValues.split(',')
            return test(entryValues)
        })
    }

    const getFieldFormRoot = (root,fieldName) => {
        if ('formFields' in root 
            && typeof root.formFields === 'object'
            && Object.keys(root.formFields).length > 0){
            if (fieldName in root.formFields){
                return root.formFields[fieldName]
            }
            for (const key in root.formFields) {
                if (Object.hasOwnProperty.call(root.formFields, key)) {
                    const field = root.formFields[key];
                    if ('name' in field && field.name === fieldName){
                        return field
                    }
                }
            }
        }
        return null
    }

    const updateNbForEachFilter = (root,fieldName,availableEntriesForThisFilter) => {
        for (let option of root.filters[fieldName].list) {
            if (typeof customCalculatebFromAvailableEntries == "function"){
                // allow usage of custom function if available
                option.nb = customCalculatebFromAvailableEntries(option,availableEntriesForThisFilter,root,fieldName)
            } else {
                option.nb = getEntriesForThisField(availableEntriesForThisFilter,fieldName,(values)=>values.some((value)=>value == option.value)).length
            }
        }
    }

    const updateVisibilityIfSublevel = (root) => {
        if (!isSubLevel(root)){
            return
        }
        Object.keys(root.filters).forEach((fieldName)=>{
            const filter = root.filters[fieldName]
            if (fieldName in refreshOptionCache.options){
                const childField = refreshOptionCache.options[fieldName]
                if (childField.parentId
                    && childField.parentId.length > 0
                    && childField.parentId in refreshOptionCache.parents
                    && childField.parentId in root.filters){
                    const parentField = refreshOptionCache.parents[childField.parentId]
                    const parentFilter = root.filters[childField.parentId]
                    const parentValues = parentFilter.list.filter((option)=>option.checked).map(option=>option.value)
                    const parentValueIsChecked = (parentValue,option)=>{
                        return (parentValue in parentField.secondLevelValues)
                            ? parentField.secondLevelValues[parentValue].includes(option.value)
                            : false
                    }
                    for (let index = 0; index < filter.list.length; index++) {
                        const option = filter.list[index]
                        option.hide = canShowAnd(root)
                            ? !parentValues.every((parentValue)=>parentValueIsChecked(parentValue,option))
                            : !parentValues.some((parentValue)=>parentValueIsChecked(parentValue,option))
                    }
                }
            }
            if (fieldName in refreshOptionCache.parents){
                for (let index = 0; index < filter.list.length; index++) {
                    const option = filter.list[index]
                    option.forceShow = true
                }
            }
        })
    }

    const getCheckedFiltersWithMoreThanOne = (root) => {
        let modeThanOneCheckedFiltersName = [];
        for(let fieldName in root.filters) {
            for (let option of root.filters[fieldName].list) {
                if (option.checked) {
                    if (!modeThanOneCheckedFiltersName.includes(fieldName)){
                        modeThanOneCheckedFiltersName.push(fieldName)
                    }
                }
            }
        }
        return modeThanOneCheckedFiltersName
    }

    const refreshOptionCache = {
        options: {},
        parents: {}
    }
    const getSanitizedIds = (root) => {
        if (!('ids' in refreshOptionCache)){
            refreshOptionCache.ids = (typeof root.params.id === 'string'
             ? root.params.id.split(',')
             : root.params.id).filter((id)=>(typeof id === 'string') && String(Number(id)) === String(id) && Number(id) > 0)
        }
        return refreshOptionCache.ids
    }
    const extractFormIdData = (fieldName,parentField) => {
        if (!('listOfAssociatingForms' in parentField)){
            parentField.listOfAssociatingForms = {}
        }
        parentField.childrenIds.forEach((id)=>{
            if (!(id in parentField.listOfAssociatingForms)){
                let associatingFormId = refreshOptionCache.options[id].associatingFormId
                if (associatingFormId.length > 0){
                    parentField.listOfAssociatingForms[id] = {
                        childId:id,
                        id:associatingFormId,
                        isForm:refreshOptionCache.options[id].isForm,
                        wantedFieldId:refreshOptionCache.options[id].associatingFieldId
                    }
                }
            }
        })
        return parentField.listOfAssociatingForms[fieldName]
    }
    const updateSecondLevelValues = (value,filterOption,childField,parentField,secondLevelValues,formModified,associations) =>{
        parentField.secondLevelValues[value] = secondLevelValues[filterOption.name]
        Object.entries(associations[filterOption.name]).forEach(([val,parentValue])=>{
            if (!(val in childField.associations)){
                childField.associations[val] = []
            }
            if (!childField.associations[val].includes(parentValue)){
                childField.associations[val].push(parentValue)
            }
        })
    }
    const refreshOption = (filterOption,promisesData,root) => {
        const field = getFieldFormRoot(root,filterOption.name)
        if (field !== null && Object.keys(field).length > 0
            && !(filterOption.name in refreshOptionCache.options)){
            // start refresh
            refreshOptionCache.options[filterOption.name] = {
                status: 'refreshing',
                linkedObjectId: '',
                associations: {}
            }
            refreshOptionCache.options[filterOption.name] = {
                ...refreshOptionCache.options[filterOption.name],
                ...twoLevelsHelper.formatChildField(field)
            }
            const childField = refreshOptionCache.options[filterOption.name]
            if ('parentFieldName' in childField && childField.parentFieldName.length > 0){
                twoLevelsHelper.formatParentField(
                    refreshOptionCache.parents,
                    childField,
                    ()=>{
                        return getFieldFormRoot(root,childField.parentFieldName)
                    }
                )
                if (childField.parentId in refreshOptionCache.parents){
                    const parentField = refreshOptionCache.parents[childField.parentId]
                    parentField.secondLevelValues = {}
                    const optionsAsEntries = Object.entries(parentField.field.options)
                    for (let index = 0; index < optionsAsEntries.length; index++) {
                        const optionKey = optionsAsEntries[index][0]
                        const values = [optionKey]
                        if (parentField.isForm){
                            twoLevelsHelper.createPromise(promisesData,{
                                formId: parentField.linkedObjectId,
                                processFormAsync: async (form)=>{
                                    return twoLevelsHelper.getAvailableSecondLevelsValues(form,parentField,values,refreshOptionCache.options)
                                        .then(([secondLevelValues,formModified,associations])=>{
                                            updateSecondLevelValues(optionKey,filterOption,childField,parentField,secondLevelValues,formModified,associations)
                                            return [secondLevelValues,formModified,associations]
                                        })
                                },
                                getEntriesAsync: ()=>{
                                    return twoLevelsHelper.getParentEntries(values)
                                },
                                getEntriesLabel: `getting parentEntries for ${JSON.stringify(values)}`}
                            )
                        } else {
                            const formIdData = extractFormIdData(filterOption.name,parentField)
                            const formId = formIdData.id
                            twoLevelsHelper.createPromise(promisesData,{
                                formId,
                                processFormAsync: async (form)=>{
                                    return twoLevelsHelper.getAvailableSecondLevelsValuesForLists(
                                        form,
                                        parentField.field.propertyname,
                                        parentField,
                                        values,
                                        formIdData,
                                        refreshOptionCache.options
                                    )
                                    .then(([secondLevelValues,formModified,associations])=>{
                                        updateSecondLevelValues(optionKey,filterOption,childField,parentField,secondLevelValues,formModified,associations)
                                        return [secondLevelValues,formModified,associations]
                                    })
                                },
                                getEntriesAsync: ()=>{
                                    return twoLevelsHelper.getAllEntries(formId)
                                },
                                getEntriesLabel: `getting all entries of form ${formId}`})
                        }
                    }
                }
            }
        }
    }
    const refreshOptionsAsync = async (root) => {
        try {
            if (!isSubLevel(root)
                || Object.keys(refreshOptionCache.options).length > 0){
                return
            }
            const filters = root.filters // TODO check if get computedFilters
            let promisesData = twoLevelsHelper.initPromisesData()
            for (const filterId in filters) {
                if (Object.hasOwnProperty.call(filters, filterId)) {
                    const filter = filters[filterId]
                    filter.list.forEach((filterOption)=>{
                        if (!(filterOption.name in refreshOptionCache.options)){
                            refreshOption(filterOption,promisesData,root)
                        }
                    })
                }
            }
            if (promisesData.promises.length > 0){
                await twoLevelsHelper.resolvePromises(promisesData)
                // something could have changes
                // trigger update entries
                root.filteredEntries = [...root.filteredEntries]
            }
            
            Object.keys(refreshOptionCache.options).forEach((k)=>{
                refreshOptionCache.options[k].status = 'done'
                // todo only update the right ones
            })

        } catch (error) {
            console.error(error)
        }
    }

    Vue.prototype.isDisplayedFilterOption = function(filterOption,root){
        return root.params.autohidefilter === "false" // main param
            || (!canShowAnd(root) && filterOption.checked) // display if checked in all case
            || (root.params.keepallparents !== "false" && filterOption.forceShow === true) // display if parentField of sublevel
            || (filterOption.hide !== true &&  filterOption.nb > 0) // hide or at least one element
    }
    Vue.prototype.filterHasAtLeastOneOption = function(filter,root){
        if (typeof customfilterHasAtLeastOneOption == "function"){
            // allow usage of custom function if available
            return customfilterHasAtLeastOneOption(filter,root)
        } else {
            return filter.list.some((filterOption)=>Vue.prototype.isDisplayedFilterOption(filterOption,root));
        }
    }
    Vue.component('FilterLoadRoot', {
        props: ['root'],
        data: function(){
            return {
                actions: {
                    filteredEntries: 'updateFilteredEntries',
                    params: 'processParams'
                },
                unwatcher: {}
            };
        },
        methods: {
            processParams: function(){
                this.unwatcher.params();
                if (canShowAnd(this.root)){
                    this.registerWatcher('filteredEntries');
                }
            },
            registerWatcher: function(varname){
                if (varname in this.actions && typeof this[this.actions[varname]] == "function"){
                    this.unwatcher[varname] = this.root.$watch(varname,()=>(this[this.actions[varname]])())
                }
            },
            updateFilteredEntries: function(){
                if (Object.keys(this.root.computedFilters).length > 0){
                    const results = filterEntriesSync(this.root.searchedEntries,this.root)
                    this.unwatcher.filteredEntries();
                    this.root.filteredEntries = results
                    this.registerWatcher('filteredEntries');
                    this.root.paginateEntries();
                }
            }
        },
        mounted(){
            this.registerWatcher('params');
        },
        template: `
        <span v-show="false"></span>
        `
    });
    Vue.prototype.refreshedFiltersWithentries = function(entries,root){
        refreshOptionsAsync(root)
        const modeThanOneCheckedFiltersName = getCheckedFiltersWithMoreThanOne(root)
        for(let fieldName in root.filters) {
            let availableEntriesForThisFilter = root.searchedEntries;
            if (root.params.template === "map"){
                availableEntriesForThisFilter = availableEntriesForThisFilter.filter(entry => entry.bf_latitude && entry.bf_longitude)
            }
            if (modeThanOneCheckedFiltersName.includes(fieldName)){
                modeThanOneCheckedFiltersName
                    .filter(fName=>fName!=fieldName)
                    .forEach((otherFieldName)=>{
                        availableEntriesForThisFilter = getEntriesForThisField(
                            availableEntriesForThisFilter,
                            otherFieldName,
                            (values)=>{
                                return root.filters[otherFieldName].list.some((option)=>option.checked && values.some(value=>value == option.value))
                            }
                        )
                });
            } else {
                availableEntriesForThisFilter = (root.params.template === "map")
                    ? root.filteredEntries.filter(entry => entry.bf_latitude && entry.bf_longitude)
                    : root.filteredEntries
            }
            availableEntriesForThisFilter = filterEntriesSync(availableEntriesForThisFilter,root)
            updateNbForEachFilter(root,fieldName,availableEntriesForThisFilter)
            updateVisibilityIfSublevel(root)
        }
        return root.filters;
    };
}